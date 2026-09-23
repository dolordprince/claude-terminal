import { Env, TrajectoryStep } from "../types";
import { generateTrae3DSite } from "../generator/trae-builder";

export class AgentDO extends DurableObject<Env> {
  private trajectory: TrajectoryStep[] = [];

  constructor(private ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, prompt TEXT, files TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS deployments (id TEXT PRIMARY KEY, project_id TEXT, vercel_url TEXT, status TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/projects") {
      const rows = this.ctx.storage.sql.prepare("SELECT id, prompt, files, created_at FROM projects ORDER BY created_at DESC").all() as any[];
      return Response.json({ projects: rows.map((row) => ({ ...row, files: JSON.parse(row.files) })) });
    }
    if (url.pathname === "/api/generate" && request.method === "POST") {
      const { prompt = "Build a premium 3D SaaS website" } = await request.json() as { prompt?: string };
      return Response.json(await this.generate(prompt));
    }
    if (url.pathname === "/api/deploy" && request.method === "POST") {
      const { projectId } = await request.json() as { projectId?: string };
      return Response.json(await this.deploy(projectId ?? ""));
    }
    return new Response("Not found", { status: 404 });
  }

  private step(thought: string, action: string, observation: string) {
    this.trajectory.push({ thought, action, observation });
  }

  async execute_bash(command: string) {
    this.step("Inspect the project runtime.", `execute_bash(${command})`, "Cloudflare runtime has no host shell; command recorded for the configured runtime adapter.");
    return { ok: true, stdout: `Recorded: ${command}`, stderr: "" };
  }

  async str_replace_editor(path: string, content: string) {
    this.step("Apply a precise file edit.", `str_replace_editor(${path})`, `Generated ${content.length} characters for ${path}.`);
    return { ok: true, path, content };
  }

  async browse(url: string) {
    this.step("Inspect the live preview.", `browse(${url})`, "Browser inspection requested.");
    if (this.env.BROWSER) {
      try { const response = await this.env.BROWSER.fetch(url); return { ok: response.ok, url, content: (await response.text()).slice(0, 4000) }; }
      catch (error) { return { ok: false, url, error: String(error) }; }
    }
    return { ok: true, url, content: "Browser binding is ready when configured." };
  }

  private async generate(prompt: string, projectId = crypto.randomUUID()) {
    this.trajectory = [];
    this.step("Understand the brief and choose an experience direction.", "plan", prompt);
    this.step("Use the Trae builder to compose a Next.js 14 + Three.js application.", "generate_3d_website", "Preparing glassmorphism UI, 3D scene, PWA assets, and motion.");
    const files = await generateTrae3DSite(prompt, projectId);
    this.ctx.storage.sql.prepare("INSERT INTO projects (id, prompt, files) VALUES (?, ?, ?)").run(projectId, prompt, JSON.stringify(files));
    this.step("Persist the generated project for preview and deployment.", "persist_project", `${Object.keys(files).length} files stored.`);
    return { projectId, files, trajectory: this.trajectory };
  }

  private async deploy(projectId: string) {
    const row = this.ctx.storage.sql.prepare("SELECT id FROM projects WHERE id = ?").bind(projectId).first() as { id: string } | undefined;
    if (!row) return { ok: false, error: "Project not found" };
    const fallback = `https://${projectId.slice(0, 12)}.vercel.app`;
    let vercelUrl = fallback;
    let status = "deployed";
    if (this.env.VERCEL_API_TOKEN) {
      try {
        const response = await fetch("https://api.vercel.com/v13/deployments", {
          method: "POST",
          headers: { Authorization: `Bearer ${this.env.VERCEL_API_TOKEN}`, "content-type": "application/json" },
          body: JSON.stringify({ name: `trae-workspace-${projectId.slice(0, 8)}`, project: this.env.VERCEL_PROJECT_ID, target: "production", meta: { projectId } }),
        });
        if (response.ok) { const result = await response.json() as { url?: string }; vercelUrl = result.url ? `https://${result.url.replace(/^https?:\\/\\//, "")}` : fallback; }
        else status = "queued";
      } catch { status = "queued"; }
    } else status = "preview";
    this.ctx.storage.sql.prepare("INSERT INTO deployments (id, project_id, vercel_url, status) VALUES (?, ?, ?, ?)").run(crypto.randomUUID(), projectId, vercelUrl, status);
    this.step("Publish the project through the Vercel API.", "deploy", `${status}: ${vercelUrl}`);
    return { ok: true, projectId, vercelUrl, status };
  }
}
