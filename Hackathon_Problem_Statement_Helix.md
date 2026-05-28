# Helix Hackathon Problem Statement and Proposed Solution

Date: April 24, 2026  
Team Name: Helix (update as needed)  
Hackathon Track: AI Productivity and Developer Tools (update as needed)

## 1. Problem Statement

Building a modern web product still takes too long for most founders, students, and small teams. Even when the idea is clear, the path from concept to usable prototype involves multiple blockers:

- Repeated boilerplate setup for frameworks, routing, and UI structure
- Slow iteration cycles between idea, implementation, and testing
- Dependency on experienced developers for early-stage prototypes
- Fragmented workflow across design, coding, preview, and deployment tools
- Difficulty in moving from generated code to collaboration-ready repositories

As a result, many promising ideas never reach a testable MVP during time-bound events like hackathons.

## 2. Proposed Solution

Helix is an AI-powered app builder that converts plain-language prompts into runnable web applications with previewable output and exportable source code. The product is designed to reduce idea-to-prototype time from days to minutes.

Helix provides a conversation-driven development flow where users describe what they want, refine the result through follow-up prompts, preview generated output, inspect files, and sync the code to GitHub.

## 3. What We Are Building in This Hackathon

Our hackathon goal is to deliver a production-minded MVP of Helix focused on rapid prototyping and collaborative handoff.

### Core Build Objectives

- Generate complete, functional Next.js app scaffolds from natural language prompts
- Provide live progress updates during generation for transparency and trust
- Enable preview and code exploration in the same interface
- Support iterative refinement through multi-turn chat
- Push generated code to GitHub repositories with conflict-aware handling

## 4. Planned Features for Hackathon Scope

1. Conversational App Generation
- Users can submit prompts such as dashboard, marketplace, portfolio, and SaaS landing pages.
- Follow-up prompts will modify and extend previously generated projects.

2. Real-Time Generation Progress
- Stage-wise progress states: queued, workspace setup, planning, coding, polishing, finalizing.
- User-visible progress bars and status messages for better UX.

3. Live Preview and Code Explorer
- In-app preview of generated project output.
- File-level browsing to inspect generated components and project structure.

4. GitHub Sync with Safe Conflict Handling
- Connect GitHub account and select/create repository.
- Preview file conflicts and apply resolution strategy before push.
- Fallback branch creation for non-destructive conflict resolution.

5. Usage and Plan Controls
- Credit-based generation limits for free and premium tiers.
- Clear usage indicators and upgrade path for scaling users.

6. Prompt Templates for Fast Start
- Curated one-click templates for common product ideas.
- Reduced friction for first-time users during demos.

7. Reliability and Guardrails
- Input validation, unsupported stack detection, and safe file path handling.
- Timeout-aware async execution for long-running generation tasks.

8. UX for Hackathon Demo Readiness
- Clean dashboard experience for new and returning users.
- Project history view for revisiting previous generations.

## 5. Solution Architecture (High Level)

- Frontend: Next.js + React + Tailwind + component library
- Backend API Layer: tRPC procedures for project, message, usage, and GitHub operations
- Async Orchestration: Inngest event workflows for AI generation pipeline
- Code Runtime: Secure sandbox execution for file operations and command runs
- Data Layer: Prisma + PostgreSQL for projects, messages, fragments, and usage
- Authentication: Clerk-based auth with OAuth support for GitHub

## 6. Expected Impact

- 10x faster MVP creation for founders, students, and hackathon teams
- Lower barrier for non-developers to test startup and product ideas
- Better collaboration between AI-generated outputs and developer workflows
- Reduced context switching by keeping prompt, preview, code, and sync in one place

## 7. Success Metrics

During and immediately after hackathon validation, we will track:

- Time to first working prototype (target: under 10 minutes)
- Prompt-to-preview success rate
- Number of successful GitHub sync operations
- Number of successful refinement iterations per project
- User satisfaction in live demo feedback

## 8. Future Scope Beyond Hackathon

- Multi-framework generation support beyond Next.js
- Backend and database schema generation from prompt
- One-click deployment targets
- Team collaboration features and shared project sessions
- Automated quality checks for accessibility and performance

## 9. One-Line Pitch

Helix helps teams turn plain-language ideas into live, shareable web apps in minutes, not days.

## 10. Submission Note

This document is a pre-build hackathon proposal that defines the problem, planned solution, and scoped features for implementation during the event.
