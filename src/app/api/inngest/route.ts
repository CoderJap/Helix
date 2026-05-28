import {serve} from "inngest/next";
import {inngest} from "@/inngest/client";
import { codeAgentFunction } from "@/inngest/functions";

const handlers = serve({
    client: inngest,
    functions:[
        codeAgentFunction,
    ],
});

export const { GET, POST } = handlers;

export const PUT = async (...args: Parameters<typeof handlers.PUT>) => {
    const [request, context] = args;

    // Some local/dev probes send empty PUT requests. Ignore them to avoid noisy parse errors.
    const body = await request.clone().text();

    if (!body.trim()) {
        return new Response("ok", { status: 200 });
    }

    return handlers.PUT(request, context);
};