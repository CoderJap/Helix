import { auth } from "@clerk/nextjs/server";
import { RateLimiterPrisma } from "rate-limiter-flexible";

import  prisma  from "@/lib/db";

const FREE_POINTS = 2;
const PRO_POINTS = 100;
const DURATION = 30 * 24 * 60 * 60; // 30 days
const GENERATION_COST = 1;

interface UsageLimitError {
  msBeforeNext: number;
  remainingPoints: number;
  consumedPoints: number;
  isFirstInDuration: boolean;
}

const isNumber = (value: unknown): value is number => {
  return typeof value === "number" && Number.isFinite(value);
};

export const isUsageLimitError = (
  error: unknown,
): error is UsageLimitError => {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as Partial<UsageLimitError>;

  return (
    isNumber(candidate.msBeforeNext) &&
    isNumber(candidate.remainingPoints) &&
    isNumber(candidate.consumedPoints) &&
    typeof candidate.isFirstInDuration === "boolean"
  );
};

export async function getUsageTracker() {
  const { has } = await auth();
  const hasProAccess = has({ plan: "pro" });

  const usageTracker = new RateLimiterPrisma({
    storeClient: prisma,
    tableName: "Usage",
    points: hasProAccess ? PRO_POINTS : FREE_POINTS,
    duration: DURATION,
  });

  return usageTracker;
};

export async function consumeCredits() {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("User not authenticated");
  }

  const usageTracker = await getUsageTracker();
  const result = await usageTracker.consume(userId, GENERATION_COST);
  return result;
};

export async function getUsageStatus() {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("User not authenticated");
  }

  const usageTracker = await getUsageTracker();
  const result = await usageTracker.get(userId);
  return result;
};