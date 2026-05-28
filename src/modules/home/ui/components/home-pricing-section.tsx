"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { CheckCircle2Icon, CrownIcon, SparklesIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const HomePricingSection = () => {
  const { isLoaded, userId, has } = useAuth();
  const hasProAccess = !!has?.({ plan: "pro" });

  const statusText = !isLoaded
    ? "Checking your plan..."
    : !userId
    ? "Sign in to view your premium status."
    : hasProAccess
    ? "Helix Gold is active on your account."
    : "You are on the free plan right now.";

  return (
    <section id="home-premium" className="w-full pb-10">
      <div className="rounded-2xl bg-linear-to-r from-amber-300/70 via-yellow-200/80 to-amber-400/70 p-px shadow-[0_10px_36px_rgba(245,158,11,0.22)]">
        <div className="rounded-2xl border border-amber-100/60 bg-linear-to-br from-amber-50/80 via-background to-yellow-50/70 p-5 md:p-7 dark:border-amber-300/20 dark:from-amber-950/20 dark:via-background dark:to-yellow-950/15">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge className="gap-1.5 bg-amber-400 text-amber-950 hover:bg-amber-300">
                  <CrownIcon className="size-3.5" />
                  Helix Gold
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    "border-amber-300/70 text-amber-900 dark:text-amber-200",
                    hasProAccess && "bg-amber-400/20",
                  )}
                >
                  {hasProAccess ? "Premium Active" : "Premium Not Active"}
                </Badge>
              </div>
              <div className="space-y-1">
                <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-foreground">
                  Premium tier, highlighted on home
                </h2>
                <p className="text-sm text-muted-foreground">{statusText}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-amber-900/90 dark:text-amber-200/90">
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/70 bg-amber-100/60 px-2.5 py-1 dark:border-amber-300/30 dark:bg-amber-900/30">
                  <SparklesIcon className="size-3.5" />
                  Higher monthly credits
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/70 bg-amber-100/60 px-2.5 py-1 dark:border-amber-300/30 dark:bg-amber-900/30">
                  <CheckCircle2Icon className="size-3.5" />
                  Priority generation access
                </span>
              </div>
            </div>
            <Button
              asChild
              className="h-9 w-full bg-amber-400 text-amber-950 hover:bg-amber-300 md:w-auto"
            >
              <Link href="/pricing">Go To Pricing</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HomePricingSection;
