import {  openai , createAgent , createTool , type Tool , createNetwork , Message , createState} from "@inngest/agent-kit";
import { inngest } from "./client";
import  { getSandbox , lastAssistantTextMessageContent} from "./utils"
import { Sandbox } from "@e2b/code-interpreter";
import {z} from "zod";
import {FRAGMENT_TITLE_PROMPT, PROMPT , RESPONSE_PROMPT} from "@/prompt"
import prisma from "@/lib/db";
import { SANDBOX_TIMEOUT } from "./types";
import {
  GENERATION_PROGRESS_PREFIX,
  encodeGenerationProgress,
  type GenerationProgressStage,
} from "@/modules/projects/lib/generation-progress";
import {
  buildUnsupportedStackMessage,
  detectUnsupportedStackRequest,
} from "@/modules/projects/lib/stack-support";

interface AgentState {
  summary: string,
  files: {[path:string]: string};
}

const DEFAULT_MAX_AGENT_ITER = 10;
const DEFAULT_AGENT_RUN_TIMEOUT_MS = 1000 * 60 * 8;
const DEFAULT_AGENT_POSTPROCESS_TIMEOUT_MS = 1000 * 60;

const resolveMaxAgentIterations = () => {
  const parsed = Number(process.env.CODE_AGENT_MAX_ITER);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_AGENT_ITER;
  }

  // Keep an upper cap to prevent unexpectedly long loops in development.
  return Math.min(Math.floor(parsed), 20);
};

const resolveTimeoutMs = (
  rawValue: string | undefined,
  fallbackMs: number,
  upperLimitMs: number,
) => {
  const parsed = Number(rawValue);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackMs;
  }

  return Math.min(Math.floor(parsed), upperLimitMs);
};

const AGENT_RUN_TIMEOUT_MS = resolveTimeoutMs(
  process.env.CODE_AGENT_RUN_TIMEOUT_MS,
  DEFAULT_AGENT_RUN_TIMEOUT_MS,
  1000 * 60 * 20,
);

const AGENT_POSTPROCESS_TIMEOUT_MS = resolveTimeoutMs(
  process.env.CODE_AGENT_POSTPROCESS_TIMEOUT_MS,
  DEFAULT_AGENT_POSTPROCESS_TIMEOUT_MS,
  1000 * 60 * 5,
);

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
) => {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
};

const MAX_AGENT_ITER = resolveMaxAgentIterations();

export const codeAgentFunction = inngest.createFunction(
  { id: "code-agent" },
  {event:"code-agent/run"},
  async({ event , step }) => {

    const progressMessageId =
      typeof event.data.progressMessageId === "string" &&
      event.data.progressMessageId.length > 0
        ? event.data.progressMessageId
        : null;

    const updateProgress = async (
      stepId: string,
      stage: GenerationProgressStage,
      progress: number,
      title: string,
      detail: string,
    ) => {
      if (!progressMessageId) {
        return;
      }

      await step.run(stepId, async () => {
        try {
          await prisma.message.update({
            where: {
              id: progressMessageId,
            },
            data: {
              content: encodeGenerationProgress({
                stage,
                progress,
                title,
                detail,
                updatedAt: new Date().toISOString(),
              }),
            },
          });
        } catch (error) {
          console.error("Failed to update generation progress", error);
        }
      });
    };

    const persistFailureMessage = async (stepId: string, message: string) => {
      await step.run(stepId, async () => {
        if (progressMessageId) {
          return await prisma.message.update({
            where: {
              id: progressMessageId,
            },
            data: {
              content: message,
              type: "ERROR",
            },
          });
        }

        return await prisma.message.create({
          data: {
            projectId: event.data.projectId,
            content: message,
            role: "ASSISTANT",
            type: "ERROR",
          },
        });
      });
    };

    const unsupportedStack = detectUnsupportedStackRequest(event.data.value);

    if (unsupportedStack) {
      await updateProgress(
        "progress-unsupported-stack",
        "finalizing",
        100,
        "Unsupported stack requested",
        "Helix currently supports Next.js (React/TypeScript) generation only.",
      );

      await persistFailureMessage(
        "save-unsupported-stack",
        buildUnsupportedStackMessage(unsupportedStack),
      );

      return {
        url: "",
        title: "Fragment",
        files: {},
        summary: "",
      };
    }

    await updateProgress(
      "progress-sandbox",
      "sandbox",
      16,
      "Preparing secure workspace",
      "Spinning up an isolated environment and booting the app runtime.",
    );

    const sandboxId = await step.run("get-sandbox-id",async()=>{
      const sandbox = await Sandbox.create("helix-nextjs-test-10");
      await sandbox.setTimeout(SANDBOX_TIMEOUT); 
      return sandbox.sandboxId
    });

    await updateProgress(
      "progress-planning",
      "planning",
      31,
      "Understanding your request",
      "Reviewing your prompt and recent project context before coding.",
    );

    const previousMessage = await step.run("get-previous-messages" , async () => {
      const formattedMessages: Message[] = [];

      const messages = await prisma.message.findMany({
        where:{
          projectId: event.data.projectId,
          content: {
            not: {
              startsWith: GENERATION_PROGRESS_PREFIX,
            },
          },
          ...(progressMessageId
            ? {
                id: {
                  not: progressMessageId,
                },
              }
            : {}),
        },
        orderBy: {
          createdAt: "desc",
        },
        take:5,
      });

      for( const message of messages) {
        formattedMessages.push({
          type:"text",
          role: message.role === "ASSISTANT" ? "assistant" : "user",
          content: message.content,
        })
      }

      return formattedMessages.reverse();

    })

    const state = createState<AgentState>(
      {
        summary: "",
        files:{},
      },
      {
        messages: previousMessage,
      },
    );


    const codeAgent = createAgent<AgentState>({
      name:"code-agent",
      description:"An expert coding agent",
      system:PROMPT,
      model:openai({
        model:"gpt-4.1",
        defaultParameters: {
          temperature:0.1,
        },
      }),
      tools:[
        createTool({
          name:"Terminal",
          description:"Use the terminal to run commands.",
          parameters:z.object({
            command: z.string(),
          }),
          handler: async({command},{step}) => {
            return await step?.run("terminal" , async() =>{
              const buffers =  {stdout:"" , stderr:""};

              try {
                const sandbox = await getSandbox(sandboxId);
                const result = await sandbox.commands.run(command, {
                  onStdout: (data:string) =>{
                    buffers.stdout += data;
                  },
                  onStderr: (data: string) => {
                    buffers.stderr +=data;
                  }
                });
                return result.stdout;
              } catch(e){
                console.error(
                  `Command failed: ${e} \nstdout: ${buffers.stdout}\nstderror: ${buffers.stderr}`,
                );
                return `Command failed: ${e} \nstdout: ${buffers.stdout}\nstderror: ${buffers.stderr}`;
              }
            });
          },
        }),
        createTool({
          name:"createOrUpdateFiles",
          description:"Create or update files in the sandbox",
          parameters:z.object({
            files: z.array(
              z.object({
                path:z.string(),
                content:z.string(),
              }),
            ),
          }),
          handler: async (
            { files },
            { step , network} : Tool.Options<AgentState>
          )=>{
            const newFiles = await step?.run("createOrUpdateFiles" , async () =>{
              try {
                const updatedFiles = network.state.data.files || {};
                const sandbox = await getSandbox(sandboxId);
                for( const file of files){
                  await sandbox.files.write(file.path, file.content);
                  updatedFiles[file.path] = file.content;
                }

                return updatedFiles;
              } catch(e){
                return "Error: "+e;
              }
             });

             if(typeof newFiles === "object"){
              network.state.data.files = newFiles;
             }
          }
        }),
        createTool({
          name:"readFiles",
          description: "Read files from the sandbox",
          parameters: z.object({
            files:z.array(z.string()),
          }),
          handler: async({files} , {step}) => {
            return await step?.run("readFiles",async() =>{
              try{
                const sandbox = await getSandbox(sandboxId);
                const contents = [];
                for(const file of files){
                  const content = await sandbox.files.read(file);
                  contents.push({path:file, content});
                }

                return JSON.stringify(contents);
              } catch(e){
                return "Error:"+e;
              }
            })
          }
        })
      ],
      lifecycle: {
        onResponse: async ({result , network}) => {
          const lastAssistantMessageText = 
            lastAssistantTextMessageContent(result);

            if(lastAssistantMessageText && network) {
              if(lastAssistantMessageText.includes("<task_summary>")) {
                network.state.data.summary = lastAssistantMessageText;
              }
            }

            return result;
        },
      },
    });

    const network = createNetwork<AgentState>({
      name:"coding-agent-network",
      agents:[codeAgent],
      maxIter:MAX_AGENT_ITER,
      defaultState:state,
      router: async({ network }) => {
        const summary = network.state.data.summary;

        if(summary) {
          return;
        }

        return codeAgent;
      },
    });

    await updateProgress(
      "progress-coding",
      "coding",
      52,
      "Generating your app",
      "Writing and updating files for the requested experience.",
    );

    let result: Awaited<ReturnType<typeof network.run>>;

    try {
      result = await withTimeout(
        network.run(event.data.value, { state }),
        AGENT_RUN_TIMEOUT_MS,
        "Code agent execution",
      );
    } catch (error) {
      console.error("Code agent execution failed", error);

      await updateProgress(
        "progress-timeout",
        "finalizing",
        99,
        "Generation timed out",
        "This run took longer than expected. Please retry with a shorter or more specific prompt.",
      );

      await persistFailureMessage(
        "save-timeout-result",
        "Generation timed out before completion. Please try again with a shorter or more specific prompt.",
      );

      return {
        url: "",
        title: "Fragment",
        files: {},
        summary: "",
      };
    }

    await updateProgress(
      "progress-polishing",
      "polishing",
      76,
      "Validating and polishing",
      "Checking generated output and preparing a stable preview build.",
    );

    const fragmentTitleGenerator = createAgent({
        name:"fragment-title-generator",
      description:"A fragment title generator",
      system:FRAGMENT_TITLE_PROMPT,
      model:openai({
        model:"gpt-4o",
      }),
    })

    const responseGenerator = createAgent({
      name:"response-generator",
      description:"A response generator",
      system:RESPONSE_PROMPT,
      model:openai({
        model:"gpt-4o",
      }),
    })

    let fragmentTitle = "Fragment";
    let responseMessage = "Here you go.";

    try {
      const { output } = await withTimeout(
        fragmentTitleGenerator.run(result.state.data.summary),
        AGENT_POSTPROCESS_TIMEOUT_MS,
        "Fragment title generation",
      );

      if (output[0]?.type === "text") {
        fragmentTitle = Array.isArray(output[0].content)
          ? output[0].content.map((txt) => txt).join("")
          : output[0].content;
      }
    } catch (error) {
      console.error("Fragment title generation failed", error);
    }

    try {
      const { output } = await withTimeout(
        responseGenerator.run(result.state.data.summary),
        AGENT_POSTPROCESS_TIMEOUT_MS,
        "Response generation",
      );

      if (output[0]?.type === "text") {
        responseMessage = Array.isArray(output[0].content)
          ? output[0].content.map((txt) => txt).join("")
          : output[0].content;
      }
    } catch (error) {
      console.error("Response generation failed", error);
      responseMessage =
        "I finished generating your project, but formatting the final response took too long.";
    }

    await updateProgress(
      "progress-finalizing",
      "finalizing",
      92,
      "Finalizing your result",
      "Packaging the response and linking the runnable preview.",
    );

    const isError = 
      !result.state.data.summary ||
      Object.keys(result.state.data.files || {}).length === 0;

    const sandboxUrl = await step.run("get-sandbox-url" , async ()=>{
      const sandbox = await getSandbox(sandboxId);
      const host = sandbox.getHost(3000);
      return `https://${host}`;
    })

    await updateProgress(
      "progress-saving",
      "finalizing",
      97,
      "Saving generated project",
      "Persisting files, metadata, and preview references.",
    );

    await step.run("save-result",async() =>{

      if(isError){
        if(progressMessageId) {
          return await prisma.message.update({
            where: {
              id: progressMessageId,
            },
            data: {
              content: "Something went wrong. Please try again.",
              type:"ERROR",
            },
          });
        }

        return await prisma.message.create({
          data: {
            projectId: event.data.projectId,
            content: "Something went wrong. Please try again.",
            role:"ASSISTANT",
            type:"ERROR",
          },
        });
      }

      if(progressMessageId) {
        return await prisma.message.update({
          where: {
            id: progressMessageId,
          },
          data: {
            content: responseMessage,
            type:"RESULT",
            fragment: {
              create: {
                sandboxUrl:sandboxUrl,
                title:fragmentTitle,
                files: result.state.data.files,
              },
            },
          },
        });
      }

      return await prisma.message.create({

        data:{
          projectId: event.data.projectId,
          content: responseMessage,
          role:"ASSISTANT",
          type:"RESULT",
          fragment: {
            create: {
              sandboxUrl:sandboxUrl,
              title:fragmentTitle,
              files: result.state.data.files,
            },
          },
        },
      })
    })

    return {
      url:sandboxUrl,
      title:"Fragment",
      files:result.state.data.files,
      summary: result.state.data.summary,
    };
  },
);