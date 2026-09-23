import { Env, RuntimeResult, TrajectoryStep } from "../types";
import { AgentRuntime } from "../runtime/AgentRuntime";
import { generateTrae3DSite } from "../generator/trae-builder";

export class AgentDO extends DurableObject<Env> {
  private readonly env: Env;
  private trajectory: TrajectoryStep[] = [];

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.env = env;
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, prompt TEXT NOT NULL, files TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS deployments (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, vercel_url TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS trajectory (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, sequence INTEGER NOT NULL, thought TEXT NOT NULL, action TEXT NOT NULL, arguments TEXT NOT NULL, observation TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/projects") return Response.json({ projects: this.rows("SELECT * FROM projects ORDER BY created_at DESC") });
    if (url.pathname === "/api/trajectory") return Response.json({ trajectory: this.rows("SELECT * FROM trajectory ORDER BY sequence ASC") });
    if (url.pathname === "/api/generate" && request.method === "POST") {
      const body = await request.json() as { prompt?: string };
      if (!body.prompt?.trim()) return Response.json({ error: "prompt is required" }, { status: 400 });
      return Response.json(await this.generate(body.prompt.trim()));
    }
    if (url.pathname === "/api/deploy" && request.method === "POST") {
      const body = await request.json() as { projectId?: string };
      if (!body.projectId) return Response.json({ error: "projectId is required" }, { status: 400 });
      return Response.json(await this.deploy(body.projectId));
    }
    return new Response("Not found", { status: 404 });
  }

  private rows(sql: string) {
    return this.ctx.storage.sql.prepare(sql).all() as unknown[];
  }

  private record(projectId: string, thought: string, action: string, args: Record<string, unknown>, observation: string, status: TrajectoryStep["status"]) {
    const item: TrajectoryStep = { id: crypto.randomUUID(), sequence: this.trajectory.length, thought, action, arguments: args, observation, status, created_at: new Date().toISOString() };
    this.trajectory.push(item);
    this.ctx.storage.sql.prepare("INSERT INTO trajectory (id, project_id, sequence, thought, action, arguments, observation, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(item.id, projectId, item.sequence, thought, action, JSON.stringify(args), observation, status);
  }

  private async generate(prompt: string) {
    const projectId = crypto.randomUUID();
    this.trajectory = [];
    this.record(projectId, "Classify the request and select the implementation plan.", "plan", { prompt }, "Delegating planning to the configured Trae Agent service.", "running");
    const files = await generateTrae3DSite(this.env, prompt, projectId);
    this.record(projectId, "Persist the generated source tree before validation.", "write_project", { fileCount: Object.keys(files).length }, "Generated source tree received from Trae Agent.", "completed");
    const runtime = new AgentRuntime(this.env, projectId);
    const build = await runtime.build();
    this.record(projectId, "Validate the generated application with its real runtime.", "build", {}, build.ok ? build.stdout ?? "build passed" : build.error ?? "build failed", build.ok ? "completed" : "failed");
    if (!build.ok) return { projectId, files, trajectory: this.trajectory, error: "Generated project failed validation" };
    this.ctx.storage.sql.prepare("INSERT INTO projects (id, prompt, files) VALUES (?, ?, ?)").run(projectId, prompt, JSON.stringify(files));
    return { projectId, files, trajectory: this.trajectory };
  }

  private async deploy(projectId: string) {
    const row = this.ctx.storage.sql.prepare("SELECT files FROM projects WHERE id = ?").bind(projectId).first() as { files: string } | undefined;
    if (!row) return { ok: false, error: "Project not found" };
    const files = JSON.parse(row.files) as Record<string, string>;
    const filesPayload = Object.entries(files).map(([file, data]) => ({ file, data }));
    const query = this.env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(this.env.VERCEL_TEAM_ID)}` : "";
    const response = await fetch(`https://api.vercel.com/v13/deployments${query}`, { method: "POST", headers: { Authorization: `Bearer ${this.env.VERCEL_API_TOKEN}`, "content-type": "application/json" }, body: JSON.stringify({ name: this.env.VERCEL_PROJECT_ID ?? `claude-terminal-${projectId.slice(0, 8)}`, project: this.env.VERCEL_PROJECT_ID, target: "production", files: filesPayload, meta: { projectId } }) });
    const payload = await response.json() as { id?: string; url?: string; readyState?: string; error?: { message?: string } };
    const status = response.ok ? (payload.readyState ?? "QUEUED") : "ERROR";
    const deploymentUrl = payload.url ? `https://${payload.url.replace(/^https?:\\/\\//, "")}` : null;
    this.ctx.storage.sql.prepare("INSERT INTO deployments (id, project_id, vercel_url, status) VALUES (?, ?, ?, ?)").run(payload.id ?? crypto.randomUUID(), projectId, deploymentUrl, status);
    if (!response.ok) return { ok: false, error: payload.error?.message ?? `Vercel returned ${response.status}` };
    return { ok: true, projectId, deploymentId: payload.id, vercelUrl: deploymentUrl, status };
  }
}
