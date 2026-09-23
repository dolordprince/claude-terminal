export interface Env {
  AgentDO: DurableObjectNamespace;
  ASSETS: { fetch(request: Request): Promise<Response> };
  BROWSER?: Fetcher;
  OPENHANDS_API_URL: string;
  TRAE_AGENT_API_URL: string;
  AGENT_RUNTIME_URL: string;
  VERCEL_API_TOKEN: string;
  VERCEL_PROJECT_ID?: string;
  VERCEL_TEAM_ID?: string;
}

export type Role = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: Role;
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface TrajectoryStep {
  id: string;
  sequence: number;
  thought: string;
  action: string;
  arguments: Record<string, unknown>;
  observation: string;
  status: "running" | "completed" | "failed";
  created_at: string;
}

export interface GeneratedProject {
  id: string;
  prompt: string;
  files: Record<string, string>;
  trajectory: TrajectoryStep[];
}

export interface RuntimeResult {
  ok: boolean;
  stdout?: string;
  stderr?: string;
  content?: string;
  exitCode?: number;
  error?: string;
}
