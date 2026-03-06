import {messagesRouter} from "@/modules/messages/server/procedures"
import { projectsRouter } from "@/modules/projects/server/procedures";

import { createTRPCRouter } from "../init";

export const appRouter = createTRPCRouter({
    messages: messagesRouter,
    projects: projectsRouter,
});

export type AppRouter = typeof appRouter;