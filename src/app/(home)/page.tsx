"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ProjectForm } from "@/modules/home/ui/components/project-form";
import ProjectsList from "@/modules/home/ui/components/projects-list";

const Page = () => {
  const mouse = useRef({ x: -1000, y: -1000 });
  const pos = useRef({ x: -1000, y: -1000 });
  const spotlightRef = useRef<HTMLDivElement>(null);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
      if (!entered) setEntered(true);
    };

    const animate = () => {
      pos.current.x += (mouse.current.x - pos.current.x) * 0.03;
      pos.current.y += (mouse.current.y - pos.current.y) * 0.03;

      if (spotlightRef.current) {
        spotlightRef.current.style.setProperty("--x", `${pos.current.x}px`);
        spotlightRef.current.style.setProperty("--y", `${pos.current.y}px`);
      }

      requestAnimationFrame(animate);
    };

    window.addEventListener("mousemove", handleMouseMove);
    const raf = requestAnimationFrame(animate);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(raf);
    };
  }, [entered]);

  return (
    <div className="flex flex-col max-w-5xl mx-auto w-full px-4">

      {/* Spotlight overlay */}
      <div
        ref={spotlightRef}
        className="pointer-events-none fixed inset-0 -z-10 transition-opacity duration-700"
        style={{
          opacity: entered ? 1 : 0,
          background: "radial-gradient(400px circle at var(--x, -1000px) var(--y, -1000px), oklch(0.6716 0.1368 48.5130 / 0.13) 0%, oklch(0.6716 0.1368 48.5130 / 0.05) 40%, transparent 70%)",
        }}
      />

      {/* Static ambient glow */}
      <div
        className="pointer-events-none fixed top-[-10%] left-[25%] w-[700px] h-[400px] rounded-full opacity-25 dark:opacity-15 blur-[140px] -z-10"
        style={{
          background: "radial-gradient(circle, oklch(0.8721 0.0864 68.5474) 0%, oklch(0.6716 0.1368 48.5130) 50%, transparent 100%)",
        }}
      />

      <section className="flex flex-col items-center gap-6 py-[12vh] 2xl:py-40">

        {/* Logo */}
        <div className="hidden md:block drop-shadow-sm">
          <Image src="/logo.svg" alt="Helix" width={56} height={56} />
        </div>

        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-medium tracking-widest uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          AI-Powered Builder
        </div>

        {/* Headline */}
        <div className="flex flex-col items-center gap-3 text-center">
          <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.1] text-foreground">
            Build something{" "}
            <span className="text-primary">with Helix</span>
          </h1>
          <p className="text-sm md:text-base text-muted-foreground max-w-sm leading-relaxed">
            Describe what you want to create — Helix turns your ideas into real apps and websites through conversation.
          </p>
        </div>

        {/* Form */}
        <div className="w-full max-w-3xl mx-auto">
          <div className="rounded-2xl border border-border bg-card shadow-md p-2">
            <ProjectForm />
          </div>
        </div>

        {/* Stat strip */}
        <div className="flex items-center text-muted-foreground text-xs divide-x divide-border">
          <span className="px-4">No code required</span>
          <span className="px-4">Instant preview</span>
          <span className="px-4">Ship in minutes</span>
        </div>
      </section>

      {/* Divider */}
      <div className="w-full h-px bg-border mb-12" />

      {/* Projects section with scroll target */}
      <div id="projects-list">
        <ProjectsList />
      </div>

    </div>
  );
};

export default Page;