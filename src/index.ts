import { Env } from "./types";

const json = (value: unknown, init: ResponseInit = {}) =>
  Response.json(value, {
    ...init,
    headers: { "cache-control": "no-store", ...(init.headers ?? {}) },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") return json({ ok: true, service: "claude-terminal" });

    if (!url.pathname.startsWith("/api/") && env.ASSETS) return env.ASSETS.fetch(request);

    const allowed =
      (url.pathname === "/api/generate" && request.method === "POST") ||
      (url.pathname === "/api/deploy" && request.method === "POST") ||
      (url.pathname === "/api/projects" && request.method === "GET") ||
      (url.pathname === "/api/trajectory" && request.method === "GET");

    if (!allowed) return new Response("Not found", { status: 404 });

    const stub = env.AgentDO.get(env.AgentDO.idFromName("workspace"));
    return stub.fetch(new Request(`https://agent.internal${url.pathname}${url.search}`, {
      method: request.method,
      headers: request.headers,
      body: request.method === "GET" ? undefined : await request.text(),
    }));
  },
} satisfies ExportedHandler<Env>;
