import { providersFromEnv } from "@/lib/llm";

export const dynamic = "force-dynamic";

/** GET /api/status -> { mode: "live" | "mock", providers: string[] }. Never exposes keys. */
export async function GET() {
  const { mode, providers } = providersFromEnv();
  return Response.json({ mode, providers: providers.map((p) => p.name) });
}
