import { Env } from "../types";

export async function generateTrae3DSite(env: Env, prompt: string, projectId: string): Promise<Record<string, string>> {
  const response = await fetch(`${env.TRAE_AGENT_API_URL.replace(/\/$/, "")}/v1/build`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-project-id": projectId },
    body: JSON.stringify({ prompt, projectId, stack: { framework: "nextjs", version: "14", renderer: "three", reactThreeFiber: true, motion: "framer-motion", pwa: true } }),
  });
  const payload = await response.json().catch(() => ({})) as { files?: Record<string, string>; error?: string };
  if (!response.ok || !payload.files || Object.keys(payload.files).length === 0) {
    throw new Error(payload.error ?? `Trae Agent returned ${response.status}`);
  }
  return payload.files;
}
