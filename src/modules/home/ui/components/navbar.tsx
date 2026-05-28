"use client";

import Link from "next/link";
import Image from "next/image";
import { Show, SignInButton, SignUpButton, useAuth, useUser } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { SunIcon, MoonIcon, FolderOpenIcon, ZapIcon, CrownIcon } from "lucide-react";
import UserControl from "@/components/user-control";
import { Button } from "@/components/ui/button";
import { useScroll } from "@/hooks/use-scroll";
import { useTRPC } from "@/trpc/client";
import { cn } from "@/lib/utils";

const FREE_POINTS = 2;
const PRO_POINTS = 100;

export const Navbar = () => {
  const isScrolled = useScroll();
  const { theme, setTheme } = useTheme();
  const { isSignedIn } = useUser();
  const { has } = useAuth();
  const trpc = useTRPC();

  const { data: usage } = useQuery({
    ...trpc.usage.status.queryOptions(),
    enabled: !!isSignedIn,
  });

  const hasProAccess = !!has?.({ plan: "pro" });
  const consumedPoints = usage?.consumedPoints ?? 0;
  const maxPoints = hasProAccess ? PRO_POINTS : FREE_POINTS;
  const remainingPoints = Math.max(0, maxPoints - consumedPoints);
  const usagePercent = Math.min(100, (consumedPoints / maxPoints) * 100);

  const usageColor =
    usagePercent >= 90
      ? "bg-destructive"
      : usagePercent >= 60
      ? "bg-amber-500"
      : "bg-primary";

  const scrollToProjects = () => {
    document.getElementById("projects-list")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <nav
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        isScrolled
          ? "bg-background/80 backdrop-blur-md border-b border-border shadow-sm"
          : "bg-transparent border-b border-transparent"
      )}
    >
      <div className="max-w-5xl mx-auto w-full flex justify-between items-center px-4 h-14">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group shrink-0">
          <div className="relative">
            <div className="absolute inset-0 rounded-lg bg-primary/20 blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <Image
              src="/logo.svg"
              alt="Helix"
              width={22}
              height={22}
              className="relative"
            />
          </div>
          <span className="font-semibold text-base tracking-tight text-foreground">
            Helix
          </span>
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-2">

          <Show when="signed-in">

            {/* Usage pill */}
            {usage !== undefined && (
              <div className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs text-muted-foreground">
                <ZapIcon className="size-3 text-primary shrink-0" />
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all duration-500", usageColor)}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                  <span className="tabular-nums text-[11px]">
                    {remainingPoints}/{maxPoints} left
                  </span>
                </div>
              </div>
            )}

            {/* Projects scroll button */}
            <button
              onClick={scrollToProjects}
              className="hidden sm:flex items-center gap-1.5 h-8 px-3 text-xs text-muted-foreground hover:text-foreground font-medium rounded-md hover:bg-accent transition-colors duration-150"
            >
              <FolderOpenIcon className="size-3.5" />
              Projects
            </button>

            <Link
              href="/pricing"
              className={cn(
                "hidden sm:inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md border transition-colors duration-150",
                hasProAccess
                  ? "border-amber-400/70 bg-amber-300/20 text-amber-900 hover:bg-amber-300/30 dark:text-amber-200"
                  : "border-amber-300/60 bg-amber-200/40 text-amber-900 hover:bg-amber-200/60 dark:text-amber-200",
              )}
            >
              <CrownIcon className="size-3.5" />
              {hasProAccess ? "Gold Active" : "Get Gold"}
            </Link>

            <Link
              href="/pricing"
              aria-label={hasProAccess ? "Gold Active" : "Get Gold"}
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors duration-150 sm:hidden",
                hasProAccess
                  ? "border-amber-400/70 bg-amber-300/20 text-amber-900 hover:bg-amber-300/30 dark:text-amber-200"
                  : "border-amber-300/60 bg-amber-200/40 text-amber-900 hover:bg-amber-200/60 dark:text-amber-200",
              )}
            >
              <CrownIcon className="size-3.5" />
            </Link>

          </Show>

          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="relative h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            <SunIcon className="size-3.5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <MoonIcon className="absolute size-3.5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>

          {/* Auth buttons */}
          <Show when="signed-out">
            <SignUpButton>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground text-xs font-medium h-8 px-3"
              >
                Sign up
              </Button>
            </SignUpButton>
            <SignInButton>
              <Button
                size="sm"
                className="h-8 px-4 text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 rounded-lg shadow-sm"
              >
                Sign in
              </Button>
            </SignInButton>
          </Show>

          {/* User avatar */}
          <Show when="signed-in">
            <UserControl showName />
          </Show>

        </div>
      </div>
    </nav>
  );
};