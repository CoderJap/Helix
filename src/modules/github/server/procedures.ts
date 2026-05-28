import { TRPCError } from "@trpc/server";
import { clerkClient } from "@clerk/nextjs/server";
import { z } from "zod";

import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

const githubApiBaseUrl = "https://api.github.com";

interface GithubRepositoryDto {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  default_branch: string;
  owner: {
    login: string;
  };
}

interface GithubRefDto {
  object: {
    sha: string;
  };
}

interface GithubCommitDto {
  sha: string;
  tree: {
    sha: string;
  };
}

interface GithubTreeDto {
  sha: string;
}

interface GithubApiErrorPayload {
  message?: string;
  documentation_url?: string;
  errors?: Array<{
    message?: string;
  }>;
}

class GithubApiError extends Error {
  status: number;
  payload: GithubApiErrorPayload | null;

  constructor(status: number, payload: GithubApiErrorPayload | null, message: string) {
    super(message);
    this.name = "GithubApiError";
    this.status = status;
    this.payload = payload;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const toGithubPayload = (value: unknown): GithubApiErrorPayload | null => {
  if (!isRecord(value)) {
    return null;
  }

  const payload: GithubApiErrorPayload = {};

  if (typeof value.message === "string") {
    payload.message = value.message;
  }

  if (typeof value.documentation_url === "string") {
    payload.documentation_url = value.documentation_url;
  }

  if (Array.isArray(value.errors)) {
    payload.errors = value.errors
      .filter(isRecord)
      .map((item) => ({ message: typeof item.message === "string" ? item.message : undefined }));
  }

  return payload;
};

const extractGithubMessage = (payload: GithubApiErrorPayload | null, fallback: string) => {
  if (!payload) {
    return fallback;
  }

  const detailedMessage = payload.errors?.find((err) => typeof err.message === "string")?.message;

  return payload.message || detailedMessage || fallback;
};

const githubRequest = async <T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> => {
  const response = await fetch(`${githubApiBaseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers || {}),
    },
  });

  const text = await response.text();
  const parsed = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const payload = toGithubPayload(parsed);
    const message = extractGithubMessage(payload, "GitHub request failed");
    throw new GithubApiError(response.status, payload, message);
  }

  return parsed as T;
};

const mapGithubErrorToTrpc = (error: unknown): TRPCError => {
  if (!(error instanceof GithubApiError)) {
    return new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "GitHub integration request failed",
    });
  }

  if (error.status === 401) {
    return new TRPCError({
      code: "UNAUTHORIZED",
      message: "GitHub authorization expired. Please reconnect your GitHub account.",
    });
  }

  if (error.status === 403) {
    return new TRPCError({
      code: "FORBIDDEN",
      message:
        "GitHub denied this action. Ensure your GitHub connection has repository access and required scopes.",
    });
  }

  if (error.status === 404) {
    return new TRPCError({
      code: "NOT_FOUND",
      message: "GitHub repository or branch was not found.",
    });
  }

  if (error.status === 409 || error.status === 422) {
    return new TRPCError({
      code: "CONFLICT",
      message: extractGithubMessage(error.payload, "GitHub reported a repository conflict."),
    });
  }

  return new TRPCError({
    code: "BAD_REQUEST",
    message: extractGithubMessage(error.payload, "GitHub request failed."),
  });
};

const getGithubToken = async (userId: string) => {
  const client = await clerkClient();
  const tokens = await client.users.getUserOauthAccessToken(userId, "github");

  if (!tokens.data.length) {
    return null;
  }

  const preferredToken =
    tokens.data.find((token) => token.scopes?.includes("repo")) || tokens.data[0];

  return {
    token: preferredToken.token,
    scopes: preferredToken.scopes || [],
  };
};

const mapRepository = (repo: GithubRepositoryDto) => {
  return {
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    private: repo.private,
    url: repo.html_url,
    defaultBranch: repo.default_branch,
    ownerLogin: repo.owner.login,
  };
};

const isGithubProvider = (provider: string) => {
  return provider === "github" || provider === "oauth_github";
};

const buildDisconnectedStatus = (githubAccount: {
  username?: string | null;
  imageUrl?: string | null;
} | null) => {
  const login = githubAccount?.username || null;

  return {
    connected: !!githubAccount,
    hasAccessToken: false,
    hasRepoScope: false,
    login,
    profileUrl: login ? `https://github.com/${login}` : null,
    avatarUrl: githubAccount?.imageUrl || null,
  };
};

const normalizeFragmentFiles = (files: unknown) => {
  if (!isRecord(files)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Fragment files are not in a supported format.",
    });
  }

  const normalizedFiles: Array<{ path: string; content: string }> = [];

  for (const [rawPath, rawContent] of Object.entries(files)) {
    if (typeof rawContent !== "string") {
      continue;
    }

    const path = rawPath.replace(/\\/g, "/").replace(/^\/+/, "");

    if (!path || path.includes("..") || path.startsWith(".git/")) {
      continue;
    }

    normalizedFiles.push({ path, content: rawContent });
  }

  if (!normalizedFiles.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "No valid files were found to push to GitHub.",
    });
  }

  return normalizedFiles;
};

const normalizeResolvedFiles = (files: Array<{ path: string; content: string }>) => {
  const normalizedByPath = new Map<string, string>();

  for (const file of files) {
    const path = file.path.replace(/\\/g, "/").replace(/^\/+/, "").trim();

    if (!path || path.includes("..") || path.startsWith(".git/")) {
      continue;
    }

    normalizedByPath.set(path, file.content);
  }

  const normalizedFiles = Array.from(normalizedByPath.entries()).map(([path, content]) => ({
    path,
    content,
  }));

  if (!normalizedFiles.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "No valid files were provided for conflict resolution.",
    });
  }

  return normalizedFiles;
};

const getOwnedFragment = async (projectId: string, fragmentId: string, userId: string) => {
  const fragment = await prisma.fragment.findFirst({
    where: {
      id: fragmentId,
      message: {
        projectId,
        project: {
          userId,
        },
      },
    },
  });

  if (!fragment) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Fragment not found for this project.",
    });
  }

  return fragment;
};

const getBranchSnapshot = async (
  token: string,
  owner: string,
  repository: string,
  branch: string,
) => {
  const encodedRef = encodeURIComponent(`heads/${branch}`);

  const reference = await githubRequest<GithubRefDto>(
    token,
    `/repos/${owner}/${repository}/git/ref/${encodedRef}`,
  );

  const commit = await githubRequest<GithubCommitDto>(
    token,
    `/repos/${owner}/${repository}/git/commits/${reference.object.sha}`,
  );

  return {
    commitSha: reference.object.sha,
    treeSha: commit.tree.sha,
  };
};

const isEmptyRepositoryError = (error: unknown) => {
  if (!(error instanceof GithubApiError)) {
    return false;
  }

  const messages = [
    error.payload?.message,
    error.message,
    ...(error.payload?.errors?.map((item) => item.message) || []),
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .map((value) => value.toLowerCase());

  const hasEmptyRepoSignal = messages.some((value) => {
    return (
      value.includes("git repository is empty") ||
      value.includes("repository is empty") ||
      value.includes("empty repository")
    );
  });

  return (
    (error.status === 400 || error.status === 404 || error.status === 409 || error.status === 422) &&
    hasEmptyRepoSignal
  );
};

const createCommitWithFiles = async (
  token: string,
  owner: string,
  repository: string,
  baseCommitSha: string,
  baseTreeSha: string,
  files: Array<{ path: string; content: string }>,
  commitMessage: string,
) => {
  const tree = await githubRequest<GithubTreeDto>(token, `/repos/${owner}/${repository}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: files.map((file) => ({
        path: file.path,
        mode: "100644",
        type: "blob",
        content: file.content,
      })),
    }),
  });

  const commit = await githubRequest<GithubCommitDto>(
    token,
    `/repos/${owner}/${repository}/git/commits`,
    {
      method: "POST",
      body: JSON.stringify({
        message: commitMessage,
        tree: tree.sha,
        parents: [baseCommitSha],
      }),
    },
  );

  return commit.sha;
};

const bootstrapRepositoryWithReadme = async (
  token: string,
  owner: string,
  repository: string,
  branch: string,
) => {
  const initialReadme = `# ${repository}\n\nInitialized by Helix sync.\n`;

  const putReadme = async (targetBranch?: string) => {
    await githubRequest<unknown>(token, `/repos/${owner}/${repository}/contents/README.md`, {
      method: "PUT",
      body: JSON.stringify({
        message: "chore: initialize repository for Helix sync",
        content: Buffer.from(initialReadme, "utf8").toString("base64"),
        ...(targetBranch ? { branch: targetBranch } : {}),
      }),
    });
  };

  try {
    await putReadme(branch);
    return;
  } catch (error) {
    if (!(error instanceof GithubApiError)) {
      throw error;
    }

    const message = extractGithubMessage(error.payload, error.message).toLowerCase();

    if (
      branch &&
      (error.status === 404 ||
        isEmptyRepositoryError(error) ||
        message.includes("branch") ||
        message.includes("not found") ||
        message.includes("invalid"))
    ) {
      await putReadme();
      return;
    }

    if (
      (error.status === 409 || error.status === 422) &&
      (message.includes("already exists") ||
        message.includes("sha wasn't supplied") ||
        message.includes("not empty"))
    ) {
      return;
    }

    throw error;
  }
};

const isRepositoryEmpty = async (
  token: string,
  owner: string,
  repository: string,
  branch: string,
) => {
  try {
    await githubRequest<Array<{ sha: string }>>(
      token,
      `/repos/${owner}/${repository}/commits?per_page=1&sha=${encodeURIComponent(branch)}`,
    );

    return false;
  } catch (error) {
    if (isEmptyRepositoryError(error)) {
      return true;
    }

    throw error;
  }
};

const getRepositoryFileContent = async (
  token: string,
  owner: string,
  repository: string,
  branch: string,
  path: string,
) => {
  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  try {
    const response = await githubRequest<unknown>(
      token,
      `/repos/${owner}/${repository}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
    );

    if (!isRecord(response)) {
      return null;
    }

    if (response.type !== "file" || typeof response.content !== "string") {
      return null;
    }

    const encoding = typeof response.encoding === "string" ? response.encoding : "base64";

    if (encoding !== "base64") {
      return null;
    }

    return Buffer.from(response.content.replace(/\n/g, ""), "base64").toString("utf8");
  } catch (error) {
    if (error instanceof GithubApiError && error.status === 404) {
      return null;
    }

    throw error;
  }
};

const initializeBranchWithFiles = async (
  token: string,
  owner: string,
  repository: string,
  branch: string,
  files: Array<{ path: string; content: string }>,
  commitMessage: string,
) => {
  await bootstrapRepositoryWithReadme(token, owner, repository, branch);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const snapshot = await getBranchSnapshot(token, owner, repository, branch);

    const commitSha = await createCommitWithFiles(
      token,
      owner,
      repository,
      snapshot.commitSha,
      snapshot.treeSha,
      files,
      commitMessage,
    );

    const updated = await updateBranchHead(token, owner, repository, branch, commitSha);

    if (updated) {
      return commitSha;
    }
  }

  throw new TRPCError({
    code: "CONFLICT",
    message: "Repository branch changed during initialization. Please retry push.",
  });
};

const updateBranchHead = async (
  token: string,
  owner: string,
  repository: string,
  branch: string,
  commitSha: string,
) => {
  const encodedRef = encodeURIComponent(`heads/${branch}`);

  try {
    await githubRequest<unknown>(token, `/repos/${owner}/${repository}/git/refs/${encodedRef}`, {
      method: "PATCH",
      body: JSON.stringify({
        sha: commitSha,
        force: false,
      }),
    });

    return true;
  } catch (error) {
    if (error instanceof GithubApiError && (error.status === 409 || error.status === 422)) {
      return false;
    }

    throw error;
  }
};

const forceUpdateBranchHead = async (
  token: string,
  owner: string,
  repository: string,
  branch: string,
  commitSha: string,
) => {
  const encodedRef = encodeURIComponent(`heads/${branch}`);

  await githubRequest<unknown>(token, `/repos/${owner}/${repository}/git/refs/${encodedRef}`, {
    method: "PATCH",
    body: JSON.stringify({
      sha: commitSha,
      force: true,
    }),
  });
};

const createConflictBranch = async (
  token: string,
  owner: string,
  repository: string,
  commitSha: string,
) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const branchName = `helix-sync-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 7)}`;

    try {
      await githubRequest<unknown>(token, `/repos/${owner}/${repository}/git/refs`, {
        method: "POST",
        body: JSON.stringify({
          ref: `refs/heads/${branchName}`,
          sha: commitSha,
        }),
      });

      return branchName;
    } catch (error) {
      if (error instanceof GithubApiError && error.status === 422) {
        continue;
      }

      throw error;
    }
  }

  throw new TRPCError({
    code: "CONFLICT",
    message: "Could not create a conflict resolution branch in GitHub.",
  });
};

export const githubRouter = createTRPCRouter({
  status: protectedProcedure.query(async ({ ctx }) => {
    const client = await clerkClient();
    const [tokenData, user] = await Promise.all([
      getGithubToken(ctx.auth.userId),
      client.users.getUser(ctx.auth.userId),
    ]);

    const githubAccount =
      user.externalAccounts.find((account) => isGithubProvider(account.provider)) || null;

    if (!tokenData) {
      return buildDisconnectedStatus(githubAccount);
    }

    try {
      const profile = await githubRequest<{
        login: string;
        html_url: string;
        avatar_url: string;
      }>(tokenData.token, "/user");

      return {
        connected: true,
        hasAccessToken: true,
        hasRepoScope: tokenData.scopes.includes("repo"),
        login: profile.login,
        profileUrl: profile.html_url,
        avatarUrl: profile.avatar_url,
      };
    } catch (error) {
      if (error instanceof GithubApiError && error.status === 401) {
        return buildDisconnectedStatus(githubAccount);
      }

      throw mapGithubErrorToTrpc(error);
    }
  }),

  repositories: protectedProcedure
    .input(
      z
        .object({
          search: z.string().trim().optional(),
        })
        .optional(),
    )
    .query(async ({ input, ctx }) => {
      const tokenData = await getGithubToken(ctx.auth.userId);

      if (!tokenData) {
        return [];
      }

      try {
        const repositories = await githubRequest<GithubRepositoryDto[]>(
          tokenData.token,
          "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
        );

        const search = input?.search?.toLowerCase();

        return repositories
          .map(mapRepository)
          .filter((repo) => {
            if (!search) {
              return true;
            }

            return repo.fullName.toLowerCase().includes(search);
          });
      } catch (error) {
        throw mapGithubErrorToTrpc(error);
      }
    }),

  createRepository: protectedProcedure
    .input(
      z.object({
        name: z
          .string()
          .trim()
          .min(1, { message: "Repository name is required" })
          .max(100, { message: "Repository name is too long" }),
        description: z.string().trim().max(200, { message: "Description is too long" }).optional(),
        private: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const tokenData = await getGithubToken(ctx.auth.userId);

      if (!tokenData) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Connect your GitHub account before creating repositories.",
        });
      }

      try {
        const repository = await githubRequest<GithubRepositoryDto>(
          tokenData.token,
          "/user/repos",
          {
            method: "POST",
            body: JSON.stringify({
              name: input.name,
              description: input.description,
              private: input.private,
              auto_init: true,
            }),
          },
        );

        return mapRepository(repository);
      } catch (error) {
        throw mapGithubErrorToTrpc(error);
      }
    }),

  previewConflicts: protectedProcedure
    .input(
      z.object({
        projectId: z.string().min(1, { message: "Project ID is required" }),
        fragmentId: z.string().min(1, { message: "Fragment ID is required" }),
        repositoryFullName: z
          .string()
          .trim()
          .regex(/^[^/]+\/[^/]+$/, { message: "Repository must be in owner/repo format" }),
        branch: z.string().trim().min(1).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const tokenData = await getGithubToken(ctx.auth.userId);

      if (!tokenData) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Connect your GitHub account before checking conflicts.",
        });
      }

      const fragment = await getOwnedFragment(input.projectId, input.fragmentId, ctx.auth.userId);
      const files = normalizeFragmentFiles(fragment.files);
      const [owner, repository] = input.repositoryFullName.split("/");

      if (!owner || !repository) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Repository must be in owner/repo format.",
        });
      }

      try {
        const repoInfo = await githubRequest<GithubRepositoryDto>(
          tokenData.token,
          `/repos/${owner}/${repository}`,
        );

        const targetBranch = input.branch || repoInfo.default_branch;

        const repositoryIsEmpty = await isRepositoryEmpty(
          tokenData.token,
          owner,
          repository,
          targetBranch,
        );

        const comparedFiles = repositoryIsEmpty
          ? files.map((file) => ({
              path: file.path,
              status: "added" as const,
              helixContent: file.content,
              githubContent: null,
            }))
          : await Promise.all(
              files.map(async (file) => {
                const githubContent = await getRepositoryFileContent(
                  tokenData.token,
                  owner,
                  repository,
                  targetBranch,
                  file.path,
                );

                if (githubContent === null) {
                  return {
                    path: file.path,
                    status: "added" as const,
                    helixContent: file.content,
                    githubContent: null,
                  };
                }

                if (githubContent === file.content) {
                  return {
                    path: file.path,
                    status: "same" as const,
                    helixContent: file.content,
                    githubContent,
                  };
                }

                return {
                  path: file.path,
                  status: "conflict" as const,
                  helixContent: file.content,
                  githubContent,
                };
              }),
            );

        const summary = comparedFiles.reduce(
          (acc, file) => {
            if (file.status === "conflict") {
              acc.conflicts += 1;
            } else if (file.status === "added") {
              acc.added += 1;
            } else {
              acc.same += 1;
            }

            return acc;
          },
          { conflicts: 0, added: 0, same: 0 },
        );

        return {
          repositoryFullName: repoInfo.full_name,
          branch: targetBranch,
          files: comparedFiles,
          summary,
        };
      } catch (error) {
        throw mapGithubErrorToTrpc(error);
      }
    }),

  pushFragment: protectedProcedure
    .input(
      z.object({
        projectId: z.string().min(1, { message: "Project ID is required" }),
        fragmentId: z.string().min(1, { message: "Fragment ID is required" }),
        repositoryFullName: z
          .string()
          .trim()
          .regex(/^[^/]+\/[^/]+$/, { message: "Repository must be in owner/repo format" }),
        branch: z.string().trim().min(1).optional(),
        commitMessage: z.string().trim().min(1).max(300).optional(),
        conflictStrategy: z.enum(["safe-branch", "overwrite-target"]).optional(),
        resolvedFiles: z
          .array(
            z.object({
              path: z.string().trim().min(1),
              content: z.string(),
            }),
          )
          .max(1000)
          .optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const tokenData = await getGithubToken(ctx.auth.userId);

      if (!tokenData) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Connect your GitHub account before pushing code.",
        });
      }

      const fragment = await getOwnedFragment(input.projectId, input.fragmentId, ctx.auth.userId);
      const files = input.resolvedFiles?.length
        ? normalizeResolvedFiles(input.resolvedFiles)
        : normalizeFragmentFiles(fragment.files);
      const [owner, repository] = input.repositoryFullName.split("/");

      if (!owner || !repository) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Repository must be in owner/repo format.",
        });
      }

      try {
        const repoInfo = await githubRequest<GithubRepositoryDto>(
          tokenData.token,
          `/repos/${owner}/${repository}`,
        );

        const targetBranch = input.branch || repoInfo.default_branch;
        const commitMessage =
          input.commitMessage ||
          `Helix sync for project ${input.projectId.slice(0, 8)} at ${new Date().toISOString()}`;
        const conflictStrategy = input.conflictStrategy || "safe-branch";

        const repositoryIsEmpty = await isRepositoryEmpty(
          tokenData.token,
          owner,
          repository,
          targetBranch,
        );

        if (repositoryIsEmpty) {
          const initializedCommitSha = await initializeBranchWithFiles(
            tokenData.token,
            owner,
            repository,
            targetBranch,
            files,
            commitMessage,
          );

          return {
            mode: "direct" as const,
            repositoryFullName: repoInfo.full_name,
            branch: targetBranch,
            commitSha: initializedCommitSha,
            commitUrl: `${repoInfo.html_url}/commit/${initializedCommitSha}`,
            repositoryUrl: repoInfo.html_url,
            attempts: 1,
          };
        }

        const maxAttempts = 3;
        let attempt = 0;
        let latestCommitSha = "";

        while (attempt < maxAttempts) {
          attempt += 1;

          let snapshot: { commitSha: string; treeSha: string };

          try {
            snapshot = await getBranchSnapshot(tokenData.token, owner, repository, targetBranch);
          } catch (error) {
            if (!isEmptyRepositoryError(error)) {
              throw error;
            }

            latestCommitSha = await initializeBranchWithFiles(
              tokenData.token,
              owner,
              repository,
              targetBranch,
              files,
              commitMessage,
            );

            return {
              mode: "direct" as const,
              repositoryFullName: repoInfo.full_name,
              branch: targetBranch,
              commitSha: latestCommitSha,
              commitUrl: `${repoInfo.html_url}/commit/${latestCommitSha}`,
              repositoryUrl: repoInfo.html_url,
              attempts: attempt,
            };
          }

          latestCommitSha = await createCommitWithFiles(
            tokenData.token,
            owner,
            repository,
            snapshot.commitSha,
            snapshot.treeSha,
            files,
            commitMessage,
          );

          const updated = await updateBranchHead(
            tokenData.token,
            owner,
            repository,
            targetBranch,
            latestCommitSha,
          );

          if (updated) {
            return {
              mode: "direct" as const,
              repositoryFullName: repoInfo.full_name,
              branch: targetBranch,
              commitSha: latestCommitSha,
              commitUrl: `${repoInfo.html_url}/commit/${latestCommitSha}`,
              repositoryUrl: repoInfo.html_url,
              attempts: attempt,
            };
          }
        }

        const snapshot = await getBranchSnapshot(tokenData.token, owner, repository, targetBranch);
        latestCommitSha = await createCommitWithFiles(
          tokenData.token,
          owner,
          repository,
          snapshot.commitSha,
          snapshot.treeSha,
          files,
          commitMessage,
        );

        if (conflictStrategy === "overwrite-target") {
          await forceUpdateBranchHead(
            tokenData.token,
            owner,
            repository,
            targetBranch,
            latestCommitSha,
          );

          return {
            mode: "force-updated" as const,
            repositoryFullName: repoInfo.full_name,
            branch: targetBranch,
            commitSha: latestCommitSha,
            commitUrl: `${repoInfo.html_url}/commit/${latestCommitSha}`,
            repositoryUrl: repoInfo.html_url,
            attempts: maxAttempts,
          };
        }

        const conflictBranch = await createConflictBranch(
          tokenData.token,
          owner,
          repository,
          latestCommitSha,
        );

        return {
          mode: "conflict-branch" as const,
          repositoryFullName: repoInfo.full_name,
          branch: conflictBranch,
          commitSha: latestCommitSha,
          commitUrl: `${repoInfo.html_url}/commit/${latestCommitSha}`,
          repositoryUrl: repoInfo.html_url,
          compareUrl: `${repoInfo.html_url}/compare/${targetBranch}...${conflictBranch}`,
          attempts: maxAttempts,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        if (isEmptyRepositoryError(error)) {
          const repoInfo = await githubRequest<GithubRepositoryDto>(
            tokenData.token,
            `/repos/${owner}/${repository}`,
          );

          const targetBranch = input.branch || repoInfo.default_branch;
          const commitMessage =
            input.commitMessage ||
            `Helix sync for project ${input.projectId.slice(0, 8)} at ${new Date().toISOString()}`;

          const initialCommitSha = await initializeBranchWithFiles(
            tokenData.token,
            owner,
            repository,
            targetBranch,
            files,
            commitMessage,
          );

          return {
            mode: "direct" as const,
            repositoryFullName: repoInfo.full_name,
            branch: targetBranch,
            commitSha: initialCommitSha,
            commitUrl: `${repoInfo.html_url}/commit/${initialCommitSha}`,
            repositoryUrl: repoInfo.html_url,
            attempts: 1,
          };
        }

        throw mapGithubErrorToTrpc(error);
      }
    }),
});
