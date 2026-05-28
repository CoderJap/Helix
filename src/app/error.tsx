"use client";

import { useEffect } from "react";

const CHUNK_RELOAD_KEY = "helix_chunk_reload_attempted";

type ErrorPageProps = {
    error: Error & { digest?: string };
    reset: () => void;
};

const isChunkLoadError = (error: Error) => {
    const text = `${error.name} ${error.message}`.toLowerCase();

    return (
        text.includes("chunkloaderror") ||
        text.includes("loading chunk") ||
        text.includes("failed to fetch dynamically imported module") ||
        text.includes("dynamically imported module")
    );
};

const ErrorPage = ({ error, reset }: ErrorPageProps) => {
    useEffect(() => {
        if (!isChunkLoadError(error)) {
            window.sessionStorage.removeItem(CHUNK_RELOAD_KEY);
            return;
        }

        const alreadyReloaded = window.sessionStorage.getItem(CHUNK_RELOAD_KEY);

        if (!alreadyReloaded) {
            window.sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
            window.location.reload();
        }
    }, [error]);

    return (
        <main className="flex min-h-screen items-center justify-center bg-background px-4">
            <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
                <h1 className="text-xl font-semibold">Something went wrong</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    We hit an unexpected error. You can retry safely.
                </p>
                <div className="mt-5 flex gap-3">
                    <button
                        type="button"
                        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                        onClick={() => {
                            window.sessionStorage.removeItem(CHUNK_RELOAD_KEY);
                            reset();
                        }}
                    >
                        Retry
                    </button>
                    <button
                        type="button"
                        className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
                        onClick={() => {
                            window.sessionStorage.removeItem(CHUNK_RELOAD_KEY);
                            window.location.reload();
                        }}
                    >
                        Reload Page
                    </button>
                </div>
            </div>
        </main>
    );
};

export default ErrorPage;
