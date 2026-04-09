"use client";

import Link from "next/link";
import Image from "next/image";
import { formatDistanceToNow } from "date-fns";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/client";
import { useUser } from "@clerk/nextjs";

export const ProjectsList = () => {
  const trpc = useTRPC();
  const { user } = useUser();
  const { data: projects } = useQuery(trpc.projects.getMany.queryOptions());

  if (!user) return null;

  const displayName =
    user?.firstName ||
    user?.emailAddresses[0]?.emailAddress?.split("@")[0];

  return (
    <div className="w-full flex flex-col gap-y-6 pb-16">
      {/* Section header */}
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold text-foreground tracking-tight whitespace-nowrap">
          {displayName}&apos;s Creations
        </h2>
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          {projects?.length ?? 0} project{projects?.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Empty state */}
      {projects?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-2xl border border-dashed border-border bg-muted/30">
          <div className="w-10 h-10 rounded-xl bg-muted border border-border flex items-center justify-center">
            <Image src="/logo.svg" alt="Helix" width={20} height={20} className="opacity-40" />
          </div>
          <p className="text-sm text-muted-foreground">No projects yet — start building above</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {projects?.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="group flex items-center gap-4 rounded-xl border border-border bg-card hover:bg-accent hover:border-primary/40 transition-all duration-200 p-4 shadow-sm"
            >
              {/* Logo tile */}
              <div className="shrink-0 w-10 h-10 rounded-lg bg-muted border border-border flex items-center justify-center group-hover:border-primary/40 transition-colors duration-200">
                <Image
                  src="/logo.svg"
                  alt="Helix"
                  width={22}
                  height={22}
                  className="object-contain"
                />
              </div>

              {/* Text */}
              <div className="flex flex-col min-w-0">
                <h3 className="truncate text-sm font-medium text-foreground">
                  {project.name}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDistanceToNow(project.updatedAt, { addSuffix: true })}
                </p>
              </div>

              {/* Arrow */}
              <div className="ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-primary text-sm">
                →
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProjectsList;