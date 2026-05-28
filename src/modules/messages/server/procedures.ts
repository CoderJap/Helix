import { z } from "zod";
import { TRPCError } from "@trpc/server";

import  prisma  from "@/lib/db";
import { inngest } from "@/inngest/client";
import { protectedProcedure, createTRPCRouter } from "@/trpc/init";
import { consumeCredits, isUsageLimitError } from "@/lib/usage";
import { createInitialGenerationProgress } from "@/modules/projects/lib/generation-progress";

const GENERATION_START_FAILED_MESSAGE =
  "We could not start generation right now. Please retry in a few seconds.";

export const messagesRouter = createTRPCRouter({
  getMany: protectedProcedure
  .input(
      z.object({
        projectId: z.string().min(1, { message: "Project ID is required" }),
      }),
    )
    .query(async ({ input, ctx }) => {
      const messages = await prisma.message.findMany({
        where: {
          projectId: input.projectId,
          project: {
            userId: ctx.auth.userId,
          },
        },
        include: {
          fragment: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      return messages;
    }),
  create: protectedProcedure
    .input(
      z.object({
        value: z.string()
          .min(1, { message: "Value is required" })
          .max(10000, { message: "Value is too long" }),
        projectId: z.string().min(1, { message: "Project ID is required" }),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const existingProject = await prisma.project.findUnique({
        where: {
          id: input.projectId,
          userId: ctx.auth.userId,
        },
      });

      if (!existingProject) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      try {
        await consumeCredits();
      } catch (error) {
        if (isUsageLimitError(error)) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "You have run out of credits"
          });
        }

        console.error("Failed to consume credits for message creation", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Something went wrong" });
      }

      const { createdMessage, progressMessageId } = await prisma.$transaction(
        async (tx) => {
          const message = await tx.message.create({
            data: {
              projectId: existingProject.id,
              content: input.value,
              role: "USER",
              type: "RESULT",
            },
          });

          const progressMessage = await tx.message.create({
            data: {
              projectId: existingProject.id,
              role: "ASSISTANT",
              type: "RESULT",
              content: createInitialGenerationProgress(),
            },
          });

          return {
            createdMessage: message,
            progressMessageId: progressMessage.id,
          };
        },
      );

      try {
        await inngest.send({
          name: "code-agent/run",
          data: {
            value: input.value,
            projectId: input.projectId,
            progressMessageId,
          },
        });
      } catch (error) {
        console.error("Failed to enqueue message generation", error);

        try {
          await prisma.message.update({
            where: {
              id: progressMessageId,
            },
            data: {
              type: "ERROR",
              content: GENERATION_START_FAILED_MESSAGE,
            },
          });
        } catch (updateError) {
          console.error("Failed to persist message enqueue error", updateError);
        }
      }

      return createdMessage;
    }),
});