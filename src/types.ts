export interface Env {
  AgentDO: DurableObjectNamespace;
  BROWSER: Fetcher;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  VERCEL_API_TOKEN?: string;
  VERCEL_PROJECT_ID?: string;
  APP_NAME?: string;
}

export interface TrajectoryStep {
  thought: string;
  action: string;
  observation: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
