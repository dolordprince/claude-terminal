import { Env } from "./types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, service: "claude-terminal" });
    }

    if (url.pathname.startsWith("/api/") &&
      ((url.pathname === "/api/generate" || url.pathname === "/api/deploy") && request.method === "POST" ||
       url.pathname === "/api/projects" && request.method === "GET")) {
      const stub = env.AgentDO.get(env.AgentDO.idFromName("workspace"));
      return stub.fetch(new Request(`https://agent.local${url.pathname}`, {
        method: request.method,
        headers: request.headers,
        body: request.method === "GET" ? undefined : await request.text(),
      }));
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      const input = await request.json() as { messages?: Array<{ role: string; content: string }> };
      const last = input.messages?.at(-1)?.content ?? "";
      return Response.json({ role: "assistant", content: `Workspace ready. I can build: ${last}` });
    }

    if (!url.pathname.startsWith("/api/") && env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
