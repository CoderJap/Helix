export const GENERATION_PROGRESS_PREFIX = "__HELIX_PROGRESS__:";

export const generationProgressStages = [
  "queued",
  "sandbox",
  "planning",
  "coding",
  "polishing",
  "finalizing",
] as const;

export type GenerationProgressStage = (typeof generationProgressStages)[number];

export interface GenerationProgressPayload {
  v: 1;
  stage: GenerationProgressStage;
  progress: number;
  title: string;
  detail: string;
  updatedAt: string;
}

const clampProgress = (progress: number) => {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, Math.round(progress)));
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const isGenerationProgressStage = (
  value: unknown,
): value is GenerationProgressStage => {
  return (
    typeof value === "string" &&
    generationProgressStages.includes(value as GenerationProgressStage)
  );
};

export const encodeGenerationProgress = (
  payload: Omit<GenerationProgressPayload, "v">,
) => {
  const safePayload: GenerationProgressPayload = {
    v: 1,
    stage: payload.stage,
    progress: clampProgress(payload.progress),
    title: payload.title,
    detail: payload.detail,
    updatedAt: payload.updatedAt,
  };

  return `${GENERATION_PROGRESS_PREFIX}${JSON.stringify(safePayload)}`;
};

export const createInitialGenerationProgress = () => {
  return encodeGenerationProgress({
    stage: "queued",
    progress: 6,
    title: "Queued for generation",
    detail: "Helix is provisioning a secure workspace for your app.",
    updatedAt: new Date().toISOString(),
  });
};

export const decodeGenerationProgress = (
  content: string,
): GenerationProgressPayload | null => {
  if (!content.startsWith(GENERATION_PROGRESS_PREFIX)) {
    return null;
  }

  const serializedPayload = content.slice(GENERATION_PROGRESS_PREFIX.length);

  try {
    const parsed = JSON.parse(serializedPayload) as unknown;

    if (!isRecord(parsed)) return null;
    if (parsed.v !== 1) return null;
    if (!isGenerationProgressStage(parsed.stage)) return null;
    if (typeof parsed.progress !== "number") return null;
    if (typeof parsed.title !== "string") return null;
    if (typeof parsed.detail !== "string") return null;
    if (typeof parsed.updatedAt !== "string") return null;

    return {
      v: 1,
      stage: parsed.stage,
      progress: clampProgress(parsed.progress),
      title: parsed.title,
      detail: parsed.detail,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
};
