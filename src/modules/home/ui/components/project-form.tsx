"use client";

import { z } from "zod";
import { toast } from "sonner";
import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import TextareaAutosize from "react-textarea-autosize";
import { ArrowUpIcon, Loader2Icon } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Form, FormField } from "@/components/ui/form";

import { PROJECT_TEMPLATES } from "../../constants";

const formSchema = z.object({
  value: z.string()
    .min(1, { message: "Value is required" })
    .max(10000, { message: "Value is too long" }),
});

export const ProjectForm = () => {
  const router = useRouter();
  const trpc = useTRPC();
  const clerk = useClerk();
  const queryClient = useQueryClient();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { value: "" },
  });

  const createProject = useMutation(trpc.projects.create.mutationOptions({
    onSuccess: (data) => {
      queryClient.invalidateQueries(trpc.projects.getMany.queryOptions());
      queryClient.invalidateQueries(trpc.usage.status.queryOptions());
      router.push(`/projects/${data.id}`);
    },
    onError: (error) => {
      toast.error(error.message);
      if (error.data?.code === "UNAUTHORIZED") clerk.openSignIn();
      if (error.data?.code === "TOO_MANY_REQUESTS") router.push("/pricing");
    },
  }));

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    await createProject.mutateAsync({ value: values.value });
  };

  const onSelect = (value: string) => {
    form.setValue("value", value, {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    });
  };

  const [isFocused, setIsFocused] = useState(false);
  const isPending = createProject.isPending;
  const isButtonDisabled = isPending || !form.formState.isValid;

  return (
    <Form {...form}>
      <section className="space-y-4">

        {/* Textarea card */}
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className={cn(
            "rounded-xl border bg-card transition-all duration-200 overflow-hidden",
            isFocused
              ? "border-primary/60 shadow-[0_0_0_3px_oklch(0.6716_0.1368_48.5130_/_0.08)]"
              : "border-border"
          )}
        >
          <FormField
            control={form.control}
            name="value"
            render={({ field }) => (
              <TextareaAutosize
                {...field}
                disabled={isPending}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                minRows={3}
                maxRows={8}
                className="w-full resize-none bg-transparent px-5 pt-5 pb-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none border-none leading-relaxed"
                placeholder="Describe what you'd like to build..."
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    form.handleSubmit(onSubmit)(e);
                  }
                }}
              />
            )}
          />

          {/* Bottom bar */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60 font-mono">
              <kbd className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground shadow-sm">
                ⌘ Enter
              </kbd>
              <span>to submit</span>
            </div>
            <Button
              type="submit"
              disabled={isButtonDisabled}
              className={cn(
                "h-8 w-8 rounded-full p-0 transition-all duration-200",
                isButtonDisabled
                  ? "bg-muted text-muted-foreground border border-border shadow-none cursor-not-allowed"
                  : "bg-primary text-primary-foreground hover:opacity-90 shadow-sm"
              )}
            >
              {isPending
                ? <Loader2Icon className="size-3.5 animate-spin" />
                : <ArrowUpIcon className="size-3.5" />
              }
            </Button>
          </div>
        </form>

        {/* Template chips */}
        <div className="hidden md:flex flex-wrap justify-center gap-2">
          {PROJECT_TEMPLATES.map((template) => (
            <button
              key={template.title}
              type="button"
              onClick={() => onSelect(template.prompt)}
              className="group inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-border bg-card text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-primary/5 transition-all duration-150 font-medium"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-primary/50 group-hover:bg-primary transition-colors duration-150 shrink-0" />
              {template.title}
            </button>
          ))}
        </div>

      </section>
    </Form>
  );
};