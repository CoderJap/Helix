"use client";

import Link from "next/link";
import { useEffect } from "react";

type HomeErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

const HomeErrorPage = ({ error, reset }: HomeErrorPageProps) => {
  useEffect(() => {
    console.error("Home route error", error);
  }, [error]);

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We could not render this page right now. You can safely retry.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            onClick={reset}
          >
            Retry
          </button>
          <Link
            href="/"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Back Home
          </Link>
        </div>
      </div>
    </main>
  );
};

export default HomeErrorPage;
