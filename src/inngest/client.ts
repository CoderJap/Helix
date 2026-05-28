import { Inngest } from "inngest";

const isDevelopment = process.env.NODE_ENV !== "production";

// In development, prefer local Inngest Dev Server to avoid cloud auth issues.
const defaultBaseUrl = isDevelopment ? "http://127.0.0.1:8288" : undefined;

export const inngest = new Inngest({
	id: "helix-development",
	eventKey: process.env.INNGEST_EVENT_KEY,
	isDev: isDevelopment,
	baseUrl: process.env.INNGEST_BASE_URL || process.env.INNGEST_DEVSERVER_URL || defaultBaseUrl,
});