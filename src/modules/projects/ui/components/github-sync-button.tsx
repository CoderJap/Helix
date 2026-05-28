"use client";

import { useEffect, useMemo, useState } from "react";
import { useClerk, useReverification, useUser } from "@clerk/nextjs";
import { isReverificationCancelledError } from "@clerk/nextjs/errors";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
  GitBranchIcon,
  GithubIcon,
  Loader2Icon,
  PlusIcon,
  UploadCloudIcon,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Fragment } from "@/generated/prisma";

interface Props {
  projectId: string;
  activeFragment: Fragment | null;
}

type PushResult = {
  mode: "direct" | "conflict-branch" | "force-updated";
  repositoryFullName: string;
  branch: string;
  commitSha: string;
  commitUrl: string;
  repositoryUrl: string;
  compareUrl?: string;
  attempts: number;
};

type ConflictPreviewFile = {
  path: string;
  status: "same" | "added" | "conflict";
  helixContent: string;
  githubContent: string | null;
};

type ConflictPreviewResult = {
  repositoryFullName: string;
  branch: string;
  files: ConflictPreviewFile[];
  summary: {
    conflicts: number;
    added: number;
    same: number;
  };
};

type FileResolutionMode = "helix" | "github" | "manual";

type FileResolutionState = {
  mode: FileResolutionMode;
  manualContent: string;
};

type ConnectAttemptResult = {
  redirectedTo: string | null;
  updatedExistingConnection: boolean;
};

type ClerkErrorLike = {
  message?: string;
  longMessage?: string;
  errors?: Array<{
    message?: string;
    longMessage?: string;
  }>;
};

const getClerkErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (!error || typeof error !== "object") {
    return null;
  }

  const clerkError = error as ClerkErrorLike;
  const nestedMessage = clerkError.errors?.find(
    (item) =>
      typeof item.longMessage === "string" || typeof item.message === "string",
  );

  if (typeof nestedMessage?.longMessage === "string") {
    return nestedMessage.longMessage;
  }

  if (typeof nestedMessage?.message === "string") {
    return nestedMessage.message;
  }

  if (typeof clerkError.longMessage === "string") {
    return clerkError.longMessage;
  }

  if (typeof clerkError.message === "string") {
    return clerkError.message;
  }

  return null;
};

const getStatusLabel = (status: ConflictPreviewFile["status"]) => {
  if (status === "conflict") {
    return "Conflict";
  }

  if (status === "added") {
    return "New file";
  }

  return "No diff";
};

const getStatusBadgeClasses = (status: ConflictPreviewFile["status"]) => {
  if (status === "conflict") {
    return "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300";
  }

  if (status === "added") {
    return "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300";
  }

  return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
};

const defaultResolutionForFile = (file: ConflictPreviewFile): FileResolutionState => ({
  mode: file.status === "conflict" ? "manual" : "helix",
  manualContent: file.helixContent,
});

const getDemoConflictPreview = (): ConflictPreviewResult => {
  const files: ConflictPreviewFile[] = [
    {
      path: "src/app/page.tsx",
      status: "conflict",
      helixContent:
        "export default function Home() {\n  return <main className=\"p-8\">Helix updated hero section</main>;\n}\n",
      githubContent:
        "export default function Home() {\n  return <main className=\"p-6\">GitHub branch home page</main>;\n}\n",
    },
    {
      path: "src/components/theme-toggle.tsx",
      status: "added",
      helixContent:
        "export function ThemeToggle() {\n  return <button>Toggle theme</button>;\n}\n",
      githubContent: null,
    },
    {
      path: "README.md",
      status: "same",
      helixContent: "# Demo Repository\n\nGenerated with Helix.\n",
      githubContent: "# Demo Repository\n\nGenerated with Helix.\n",
    },
  ];

  return {
    repositoryFullName: "demo/preview",
    branch: "main",
    files,
    summary: {
      conflicts: files.filter((file) => file.status === "conflict").length,
      added: files.filter((file) => file.status === "added").length,
      same: files.filter((file) => file.status === "same").length,
    },
  };
};

export const GithubSyncButton = ({ projectId, activeFragment }: Props) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { openUserProfile } = useClerk();
  const { user } = useUser();

  const [open, setOpen] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoPrivate, setNewRepoPrivate] = useState(true);
  const [commitMessage, setCommitMessage] = useState("Helix: sync generated project files");
  const [conflictStrategy, setConflictStrategy] = useState<
    "safe-branch" | "overwrite-target"
  >("safe-branch");
  const [lastPushResult, setLastPushResult] = useState<PushResult | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConflictEditorOpen, setIsConflictEditorOpen] = useState(false);
  const [conflictPreview, setConflictPreview] = useState<ConflictPreviewResult | null>(null);
  const [conflictPreviewSource, setConflictPreviewSource] = useState<"live" | "demo" | null>(
    null,
  );
  const [activeEditorPath, setActiveEditorPath] = useState<string>("");
  const [fileResolutions, setFileResolutions] = useState<Record<string, FileResolutionState>>({});
  const [useEditorResolutionsForPush, setUseEditorResolutionsForPush] = useState(false);

  const statusQuery = useQuery(trpc.github.status.queryOptions());
  const isConnected = !!statusQuery.data?.connected;
  const hasAccessToken = !!statusQuery.data?.hasAccessToken;
  const canManageRepositories = isConnected && hasAccessToken;

  const repositoriesQuery = useQuery({
    ...trpc.github.repositories.queryOptions({ search: searchValue || undefined }),
    enabled: open && canManageRepositories,
  });

  const connectWithReverification = useReverification(
    async (): Promise<ConnectAttemptResult> => {
      if (!user) {
        throw new Error("Sign in before connecting GitHub.");
      }

      const redirectUrl = `${window.location.origin}/projects/${projectId}`;

      const existingGithubAccount =
        user.externalAccounts.find((account) => account.providerSlug() === "github") || null;

      const externalAccount = existingGithubAccount
        ? await existingGithubAccount.reauthorize({
            additionalScopes: ["repo"],
            redirectUrl,
          })
        : await user.createExternalAccount({
            strategy: "oauth_github",
            redirectUrl,
            additionalScopes: ["repo"],
          });

      const externalRedirect =
        externalAccount.verification?.externalVerificationRedirectURL?.toString() || null;

      return {
        redirectedTo: externalRedirect,
        updatedExistingConnection: !!existingGithubAccount,
      };
    },
  );

  const repositories = useMemo(() => repositoriesQuery.data || [], [repositoriesQuery.data]);

  useEffect(() => {
    if (!selectedRepo && repositories.length > 0) {
      setSelectedRepo(repositories[0].fullName);
    }
  }, [repositories, selectedRepo]);

  const selectedRepository = useMemo(
    () => repositories.find((repo) => repo.fullName === selectedRepo) || null,
    [repositories, selectedRepo],
  );

  const applyConflictPreview = (
    result: ConflictPreviewResult,
    source: "live" | "demo",
  ) => {
    setConflictPreview(result);
    setConflictPreviewSource(source);
    setActiveEditorPath(result.files[0]?.path || "");

    const nextResolutions: Record<string, FileResolutionState> = {};

    for (const file of result.files) {
      nextResolutions[file.path] = defaultResolutionForFile(file);
    }

    setFileResolutions(nextResolutions);
    setUseEditorResolutionsForPush(source === "live");
    setIsConflictEditorOpen(true);
  };

  const createRepository = useMutation(
    trpc.github.createRepository.mutationOptions({
      onSuccess: (repository) => {
        toast.success(`Repository ${repository.fullName} created.`);
        setSelectedRepo(repository.fullName);
        setNewRepoName("");
        queryClient.invalidateQueries(
          trpc.github.repositories.queryOptions({ search: searchValue || undefined }),
        );
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const previewConflicts = useMutation(
    trpc.github.previewConflicts.mutationOptions({
      onSuccess: (result) => {
        applyConflictPreview(result, "live");
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const pushFragment = useMutation(
    trpc.github.pushFragment.mutationOptions({
      onSuccess: (result) => {
        setLastPushResult(result);

        if (result.mode === "direct") {
          toast.success(`Pushed to ${result.repositoryFullName} (${result.branch}).`);
          return;
        }

        if (result.mode === "force-updated") {
          toast.success(
            `Conflict auto-resolved by updating ${result.repositoryFullName} (${result.branch}).`,
          );
          return;
        }

        toast.success(
          `Conflict handled: created ${result.branch} branch for review and merge.`,
        );
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  useEffect(() => {
    setConflictPreview(null);
    setConflictPreviewSource(null);
    setActiveEditorPath("");
    setFileResolutions({});
    setUseEditorResolutionsForPush(false);
  }, [selectedRepo, activeFragment?.id]);

  const activeEditorFile = useMemo(() => {
    if (!conflictPreview) {
      return null;
    }

    if (!activeEditorPath) {
      return conflictPreview.files[0] || null;
    }

    return conflictPreview.files.find((file) => file.path === activeEditorPath) || null;
  }, [activeEditorPath, conflictPreview]);

  const activeEditorResolution = useMemo(() => {
    if (!activeEditorFile) {
      return null;
    }

    return fileResolutions[activeEditorFile.path] || defaultResolutionForFile(activeEditorFile);
  }, [activeEditorFile, fileResolutions]);

  const updateResolutionMode = (path: string, mode: FileResolutionMode) => {
    const file = conflictPreview?.files.find((item) => item.path === path);

    if (!file) {
      return;
    }

    setFileResolutions((prev) => {
      const current = prev[path] || defaultResolutionForFile(file);

      return {
        ...prev,
        [path]: {
          ...current,
          mode,
          manualContent: current.manualContent || file.helixContent,
        },
      };
    });
  };

  const updateManualContent = (path: string, manualContent: string) => {
    const file = conflictPreview?.files.find((item) => item.path === path);

    if (!file) {
      return;
    }

    setFileResolutions((prev) => {
      const current = prev[path] || defaultResolutionForFile(file);

      return {
        ...prev,
        [path]: {
          ...current,
          mode: "manual",
          manualContent,
        },
      };
    });
  };

  const buildResolvedFilesPayload = () => {
    if (!conflictPreview || conflictPreviewSource !== "live") {
      return undefined;
    }

    return conflictPreview.files.map((file) => {
      const resolution = fileResolutions[file.path] || defaultResolutionForFile(file);

      if (resolution.mode === "github") {
        return {
          path: file.path,
          content: file.githubContent ?? file.helixContent,
        };
      }

      if (resolution.mode === "manual") {
        return {
          path: file.path,
          content: resolution.manualContent,
        };
      }

      return {
        path: file.path,
        content: file.helixContent,
      };
    });
  };

  const handleConnect = async () => {
    if (!user) {
      toast.error("Sign in before connecting GitHub.");
      return;
    }

    setIsConnecting(true);

    try {
      const result = await connectWithReverification();

      const externalRedirect = result.redirectedTo;

      if (externalRedirect) {
        window.location.assign(externalRedirect);
        return;
      }

      await user.reload();
      await queryClient.invalidateQueries(trpc.github.status.queryOptions());
      await queryClient.invalidateQueries(
        trpc.github.repositories.queryOptions({ search: searchValue || undefined }),
      );

      toast.success(
        result.updatedExistingConnection
          ? "GitHub connection updated with repository access."
          : "GitHub account connected.",
      );
    } catch (error) {
      if (isReverificationCancelledError(error)) {
        toast.error("Verification was cancelled. Please verify and try again.");
        return;
      }

      const message = getClerkErrorMessage(error);

      if (message?.toLowerCase().includes("additional verification")) {
        toast.error("Please complete Clerk verification, then reconnect GitHub.");
        openUserProfile();
        return;
      }

      toast.error(message || "Unable to start GitHub connection flow.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleCreateRepository = async () => {
    const name = newRepoName.trim();

    if (!name) {
      toast.error("Repository name is required.");
      return;
    }

    try {
      await createRepository.mutateAsync({
        name,
        private: newRepoPrivate,
      });
    } catch {
      // Handled by mutation onError toast.
    }
  };

  const handleOpenMergeEditor = async () => {
    if (!activeFragment) {
      toast.error("Generate or select a fragment before opening the merge editor.");
      return;
    }

    if (!selectedRepo) {
      toast.error("Select a repository first.");
      return;
    }

    try {
      const preview = await previewConflicts.mutateAsync({
        projectId,
        fragmentId: activeFragment.id,
        repositoryFullName: selectedRepo,
      });

      if (!preview.summary.conflicts && !preview.summary.added) {
        toast.success("No incoming conflicts detected. Push is ready.");
      }
    } catch {
      // Handled by mutation onError toast.
    }
  };

  const handleOpenDemoMergeEditor = () => {
    applyConflictPreview(getDemoConflictPreview(), "demo");
    toast.success("Opened demo merge editor preview.");
  };

  const handlePush = async () => {
    if (!activeFragment) {
      toast.error("Generate or select a fragment before pushing.");
      return;
    }

    if (!selectedRepo) {
      toast.error("Select a repository first.");
      return;
    }

    if (useEditorResolutionsForPush && conflictPreviewSource === "demo") {
      toast.error("Run a real conflict preview before applying editor resolutions to push.");
      return;
    }

    const resolvedFiles = useEditorResolutionsForPush ? buildResolvedFilesPayload() : undefined;

    try {
      await pushFragment.mutateAsync({
        projectId,
        fragmentId: activeFragment.id,
        repositoryFullName: selectedRepo,
        commitMessage: commitMessage.trim() || undefined,
        conflictStrategy,
        resolvedFiles,
      });
    } catch {
      // Handled by mutation onError toast.
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2">
          <GithubIcon className="size-4" />
          <span>GitHub</span>
          {isConnected && <span className="size-1.5 rounded-full bg-primary" />}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl max-h-dvh overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GithubIcon className="size-4" />
            GitHub Sync
          </DialogTitle>
          <DialogDescription>
            Connect GitHub and push your generated project files directly into a repository.
          </DialogDescription>
        </DialogHeader>

        {statusQuery.isLoading ? (
          <div className="py-8 flex items-center justify-center text-muted-foreground text-sm gap-2">
            <Loader2Icon className="size-4 animate-spin" />
            Checking GitHub connection...
          </div>
        ) : !isConnected ? (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="text-sm font-medium">GitHub is not connected</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Connect your GitHub account to create repositories and push code from this project.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={handleConnect} className="gap-2" disabled={isConnecting}>
                {isConnecting ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <GithubIcon className="size-4" />
                )}
                Connect GitHub
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {statusQuery.data?.login
                    ? `Connected as @${statusQuery.data.login}`
                    : "GitHub account connected"}
                </p>
                {statusQuery.data?.profileUrl && (
                  <a
                    href={statusQuery.data.profileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  >
                    Open profile
                    <ExternalLinkIcon className="size-3" />
                  </a>
                )}
              </div>
              <Badge
                variant={
                  statusQuery.data?.hasRepoScope && hasAccessToken ? "default" : "outline"
                }
              >
                {!hasAccessToken
                  ? "Reconnect required"
                  : statusQuery.data?.hasRepoScope
                    ? "Repo scope granted"
                    : "Limited scope"}
              </Badge>
            </div>

            {!hasAccessToken ? (
              <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300 space-y-2">
                <p>
                  GitHub is linked, but no usable OAuth access token is available yet. Reconnect to
                  grant repository access.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleConnect}
                    disabled={isConnecting}
                    className="gap-2"
                  >
                    {isConnecting ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      <GithubIcon className="size-4" />
                    )}
                    Reconnect GitHub
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openUserProfile()}
                  >
                    Open account settings
                  </Button>
                </div>
              </div>
            ) : !statusQuery.data?.hasRepoScope ? (
              <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                Repository permissions may be limited. Reconnect GitHub if pushing fails due to access.
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="repo-search">Repository</Label>
              <Input
                id="repo-search"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search repositories..."
                disabled={!canManageRepositories}
              />
              <Select
                value={selectedRepo}
                onValueChange={setSelectedRepo}
                disabled={!canManageRepositories}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a repository" />
                </SelectTrigger>
                <SelectContent>
                  {repositories.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      No repositories found
                    </SelectItem>
                  ) : (
                    repositories.map((repo) => (
                      <SelectItem key={repo.id} value={repo.fullName}>
                        {repo.fullName}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {selectedRepository && (
                <p className="text-xs text-muted-foreground">
                  Default branch: <span className="font-medium">{selectedRepository.defaultBranch}</span>
                </p>
              )}
            </div>

            <div className="rounded-lg border p-3 space-y-3">
              <p className="text-sm font-medium">Create new repository</p>
              <div className="flex gap-2">
                <Input
                  value={newRepoName}
                  onChange={(event) => setNewRepoName(event.target.value)}
                  placeholder="my-helix-project"
                />
                <Button
                  variant="secondary"
                  onClick={handleCreateRepository}
                  disabled={createRepository.isPending || !canManageRepositories}
                  className="gap-1"
                >
                  {createRepository.isPending ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <PlusIcon className="size-4" />
                  )}
                  Create
                </Button>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  checked={newRepoPrivate}
                  onCheckedChange={setNewRepoPrivate}
                  size="sm"
                />
                <span>Private repository</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="commit-message">Commit message</Label>
              <Input
                id="commit-message"
                value={commitMessage}
                onChange={(event) => setCommitMessage(event.target.value)}
                placeholder="Helix: sync generated project files"
                disabled={!canManageRepositories}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="conflict-strategy">When branch conflicts happen</Label>
              <Select
                value={conflictStrategy}
                onValueChange={(value) =>
                  setConflictStrategy(value as "safe-branch" | "overwrite-target")
                }
                disabled={!canManageRepositories}
              >
                <SelectTrigger id="conflict-strategy" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="safe-branch">
                    Safe mode: create conflict branch for review
                  </SelectItem>
                  <SelectItem value="overwrite-target">
                    Easy mode: replace target branch with Helix code
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Safe mode never rewrites target branch history. Easy mode resolves conflicts in one
                click by force-updating the selected branch.
              </p>
            </div>

            <div className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Conflict merge editor</p>
                  <p className="text-xs text-muted-foreground">
                    Review GitHub vs Helix changes file-by-file before pushing.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="gap-2"
                    disabled={
                      previewConflicts.isPending ||
                      !activeFragment ||
                      !selectedRepo ||
                      !canManageRepositories
                    }
                    onClick={handleOpenMergeEditor}
                  >
                    {previewConflicts.isPending ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      <GitBranchIcon className="size-4" />
                    )}
                    Open editor
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleOpenDemoMergeEditor}
                  >
                    Preview demo
                  </Button>
                </div>
              </div>

              {conflictPreview ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Preview loaded for {conflictPreview.repositoryFullName} on {conflictPreview.branch}
                  </p>
                  {conflictPreviewSource === "demo" && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Demo mode is for UI preview only and will not be used for live pushes.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="border-red-500/40 bg-red-500/10">
                      {conflictPreview.summary.conflicts} conflict
                      {conflictPreview.summary.conflicts === 1 ? "" : "s"}
                    </Badge>
                    <Badge variant="outline" className="border-sky-500/40 bg-sky-500/10">
                      {conflictPreview.summary.added} new
                    </Badge>
                    <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10">
                      {conflictPreview.summary.same} unchanged
                    </Badge>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Open the editor to preview file conflicts and choose your preferred resolution.
                </p>
              )}

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  checked={useEditorResolutionsForPush}
                  onCheckedChange={setUseEditorResolutionsForPush}
                  disabled={
                    !conflictPreview ||
                    !canManageRepositories ||
                    conflictPreviewSource !== "live"
                  }
                />
                <span>Use merge editor output on next push</span>
              </div>
            </div>

            {!activeFragment && (
              <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
                <AlertTriangleIcon className="size-3.5 mt-0.5 shrink-0" />
                Generate and select a fragment first, then push that code to GitHub.
              </div>
            )}

            {lastPushResult && (
              <div
                className={cn(
                  "rounded-lg border p-3 text-xs space-y-2",
                  lastPushResult.mode === "direct"
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : lastPushResult.mode === "force-updated"
                      ? "border-sky-500/40 bg-sky-500/10"
                      : "border-amber-500/40 bg-amber-500/10",
                )}
              >
                <p className="flex items-center gap-1.5 font-medium">
                  <CheckCircle2Icon className="size-3.5" />
                  {lastPushResult.mode === "direct"
                    ? "Code pushed to target branch"
                    : lastPushResult.mode === "force-updated"
                      ? "Conflict auto-resolved on target branch"
                      : "Conflict fallback branch created"}
                </p>
                <p>
                  {lastPushResult.repositoryFullName} · {lastPushResult.branch}
                </p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={lastPushResult.commitUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    View commit
                    <ExternalLinkIcon className="size-3" />
                  </a>
                  {lastPushResult.compareUrl && (
                    <a
                      href={lastPushResult.compareUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      Open compare
                      <ExternalLinkIcon className="size-3" />
                    </a>
                  )}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                onClick={handlePush}
                disabled={
                  pushFragment.isPending ||
                  !activeFragment ||
                  !selectedRepo ||
                  !canManageRepositories
                }
                className="gap-2"
              >
                {pushFragment.isPending ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <UploadCloudIcon className="size-4" />
                )}
                Push current code
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>

      <Dialog open={isConflictEditorOpen} onOpenChange={setIsConflictEditorOpen}>
        <DialogContent className="sm:max-w-6xl max-h-dvh overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Resolve Conflicts in Editor</DialogTitle>
            <DialogDescription>
              Pick Helix, GitHub, or manual content for each file. Your selections can be applied
              on the next push.
            </DialogDescription>
          </DialogHeader>

          {!conflictPreview ? (
            <div className="py-8 flex items-center justify-center text-muted-foreground text-sm gap-2">
              <Loader2Icon className="size-4 animate-spin" />
              Loading conflict preview...
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div className="rounded-lg border bg-muted/20">
                <ScrollArea className="h-117.5">
                  <div className="p-2 space-y-1">
                    {conflictPreview.files.map((file) => {
                      const isActive = activeEditorFile?.path === file.path;

                      return (
                        <button
                          key={file.path}
                          type="button"
                          onClick={() => setActiveEditorPath(file.path)}
                          className={cn(
                            "w-full rounded-md border px-2 py-2 text-left",
                            isActive
                              ? "border-primary bg-primary/10"
                              : "border-transparent hover:border-border hover:bg-background",
                          )}
                        >
                          <p className="truncate text-xs font-medium">{file.path}</p>
                          <Badge
                            variant="outline"
                            className={cn("mt-1 text-[10px]", getStatusBadgeClasses(file.status))}
                          >
                            {getStatusLabel(file.status)}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>

              {activeEditorFile && activeEditorResolution ? (
                <div className="space-y-3 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{activeEditorFile.path}</p>
                    <Badge
                      variant="outline"
                      className={cn("text-[10px]", getStatusBadgeClasses(activeEditorFile.status))}
                    >
                      {getStatusLabel(activeEditorFile.status)}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="resolution-mode">Resolution for this file</Label>
                    <Select
                      value={activeEditorResolution.mode}
                      onValueChange={(value) =>
                        updateResolutionMode(activeEditorFile.path, value as FileResolutionMode)
                      }
                    >
                      <SelectTrigger id="resolution-mode" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="helix">Use Helix version</SelectItem>
                        <SelectItem value="github">Keep GitHub version</SelectItem>
                        <SelectItem value="manual">Manual edit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {activeEditorResolution.mode === "manual" ? (
                    <Textarea
                      value={activeEditorResolution.manualContent}
                      onChange={(event) =>
                        updateManualContent(activeEditorFile.path, event.target.value)
                      }
                      className="min-h-90 font-mono text-xs leading-5"
                    />
                  ) : (
                    <Tabs defaultValue="helix" className="w-full">
                      <TabsList variant="line">
                        <TabsTrigger value="helix">Helix version</TabsTrigger>
                        <TabsTrigger value="github">GitHub version</TabsTrigger>
                      </TabsList>
                      <TabsContent value="helix">
                        <ScrollArea className="h-90 rounded-md border bg-muted/20 p-3">
                          <pre className="whitespace-pre-wrap wrap-break-word font-mono text-xs leading-5">
                            {activeEditorFile.helixContent}
                          </pre>
                        </ScrollArea>
                      </TabsContent>
                      <TabsContent value="github">
                        <ScrollArea className="h-90 rounded-md border bg-muted/20 p-3">
                          {activeEditorFile.githubContent === null ? (
                            <p className="text-xs text-muted-foreground">
                              This file does not exist in the selected GitHub branch.
                            </p>
                          ) : (
                            <pre className="whitespace-pre-wrap wrap-break-word font-mono text-xs leading-5">
                              {activeEditorFile.githubContent}
                            </pre>
                          )}
                        </ScrollArea>
                      </TabsContent>
                    </Tabs>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                  Select a file to start resolving.
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConflictEditorOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                setUseEditorResolutionsForPush(true);
                setIsConflictEditorOpen(false);
                toast.success("Merge editor selections will be used for the next push.");
              }}
            >
              Use these resolutions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

export default GithubSyncButton;
