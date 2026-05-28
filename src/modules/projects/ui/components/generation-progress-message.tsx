import { CheckIcon, Loader2Icon } from "lucide-react";

import { cn } from "@/lib/utils";

import {
  generationProgressStages,
  type GenerationProgressPayload,
  type GenerationProgressStage,
} from "../../lib/generation-progress";

interface Props {
  progress: GenerationProgressPayload;
}

const stageLabels: Record<GenerationProgressStage, string> = {
  queued: "Queued",
  sandbox: "Workspace",
  planning: "Prompt Analysis",
  coding: "Code Generation",
  polishing: "Validation",
  finalizing: "Final Response",
};

export const GenerationProgressMessage = ({ progress }: Props) => {
  const currentStageIndex = Math.max(
    generationProgressStages.indexOf(progress.stage),
    0,
  );

  return (
    <div className="rounded-xl border border-border/70 bg-background/65 p-4 shadow-sm backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium tracking-tight">{progress.title}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {progress.detail}
          </p>
        </div>
        <span className="text-xs font-semibold text-primary/90 tabular-nums">
          {progress.progress}%
        </span>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-linear-to-r from-primary/70 via-primary to-primary transition-[width] duration-700 ease-out"
          style={{ width: `${progress.progress}%` }}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
        {generationProgressStages.map((stage, index) => {
          const isComplete = index < currentStageIndex;
          const isActive = index === currentStageIndex;

          return (
            <div
              key={stage}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]",
                isComplete && "border-primary/40 bg-primary/10 text-primary",
                isActive && "border-primary/30 bg-primary/5 text-foreground",
                !isComplete && !isActive && "border-border/70 text-muted-foreground",
              )}
            >
              {isComplete ? (
                <CheckIcon className="size-3" />
              ) : isActive ? (
                <Loader2Icon className="size-3 animate-spin text-primary" />
              ) : (
                <span className="size-1.5 rounded-full bg-muted-foreground/60" />
              )}
              <span className="truncate">{stageLabels[stage]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default GenerationProgressMessage;
