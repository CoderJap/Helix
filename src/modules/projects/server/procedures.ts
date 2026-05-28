import { z } from "zod";
import { generateSlug } from "random-word-slugs";

import prisma  from "@/lib/db";
import { TRPCError } from "@trpc/server";
import { inngest } from "@/inngest/client";
import { consumeCredits, isUsageLimitError } from "@/lib/usage";
import { protectedProcedure, createTRPCRouter } from "@/trpc/init";
import { createInitialGenerationProgress } from "@/modules/projects/lib/generation-progress";
import {
  buildUnsupportedStackMessage,
  detectUnsupportedStackRequest,
} from "@/modules/projects/lib/stack-support";

const GENERATION_START_FAILED_MESSAGE =
  "We could not start generation right now. Please retry in a few seconds.";

export const projectsRouter = createTRPCRouter({
  getOne: protectedProcedure
    .input(z.object({
      id: z.string().min(1, { message: "Id is required" }),
    }))
    .query(async ({ input, ctx }) => {
      const existingProject = await prisma.project.findUnique({
        where: {
          id: input.id,
          userId: ctx.auth.userId,
        },
      });

      if (!existingProject) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      return existingProject;
    }),
  getMany: protectedProcedure
    .query(async ({ ctx }) => {
      const projects = await prisma.project.findMany({
        where: {
          userId: ctx.auth.userId,
        },
        orderBy: {
          updatedAt: "desc",
        },
      });

      return projects;
    }),
  create: protectedProcedure
    .input(
      z.object({
        value: z.string()
          .min(1, { message: "Value is required" })
          .max(10000, { message: "Value is too long" })
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const unsupportedStack = detectUnsupportedStackRequest(input.value);

      if (unsupportedStack) {
        const createdProject = await prisma.project.create({
          data: {
            userId: ctx.auth.userId,
            name: generateSlug(2, {
              format: "kebab",
            }),
            messages: {
              create: {
                content: input.value,
                role: "USER",
                type: "RESULT",
              }
            }
          }
        });

        await prisma.message.create({
          data: {
            projectId: createdProject.id,
            role: "ASSISTANT",
            type: "ERROR",
            content: buildUnsupportedStackMessage(unsupportedStack),
          },
        });

        return createdProject;
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

        console.error("Failed to consume credits for project creation", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Something went wrong" });
      }

      const { createdProject, progressMessageId } = await prisma.$transaction(
        async (tx) => {
          const project = await tx.project.create({
            data: {
              userId: ctx.auth.userId,
              name: generateSlug(2, {
                format: "kebab",
              }),
              messages: {
                create: {
                  content: input.value,
                  role: "USER",
                  type: "RESULT",
                }
              }
            }
          });

          const progressMessage = await tx.message.create({
            data: {
              projectId: project.id,
              role: "ASSISTANT",
              type: "RESULT",
              content: createInitialGenerationProgress(),
            },
          });

          return {
            createdProject: project,
            progressMessageId: progressMessage.id,
          };
        },
      );

      try {
        await inngest.send({
          name: "code-agent/run",
          data: {
            value: input.value,
            projectId: createdProject.id,
            progressMessageId,
          },
        });
      } catch (error) {
        console.error("Failed to enqueue project generation", error);

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
          console.error("Failed to persist generation enqueue error", updateError);
        }
      }

      return createdProject;
    }),
});