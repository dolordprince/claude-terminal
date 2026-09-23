import { Env, RuntimeResult } from "../types";

export class AgentRuntime {
  constructor(private readonly env: Env, private readonly projectId: string) {}

  private async request(path: string, body: Record<string, unknown>): Promise<RuntimeResult> {
    const response = await fetch(`${this.env.AGENT_RUNTIME_URL.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-project-id": this.projectId },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({})) as RuntimeResult;
    if (!response.ok) return { ok: false, ...payload, error: payload.error ?? `Runtime returned ${response.status}` };
    return payload;
  }

  executeBash(command: string) {
    return this.request("/execute", { command });
  }

  readFile(path: string) {
    return this.request("/files/read", { path });
  }

  writeFile(path: string, content: string) {
    return this.request("/files/write", { path, content });
  }

  build() {
    return this.request("/build", {});
  }

  test() {
    return this.request("/test", {});
  }

  async browse(url: string) {
    if (!this.env.BROWSER) return { ok: false, error: "BROWSER binding is not configured" };
    try {
      const response = await this.env.BROWSER.fetch(url);
      return { ok: response.ok, content: (await response.text()).slice(0, 16000) };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  }
}
