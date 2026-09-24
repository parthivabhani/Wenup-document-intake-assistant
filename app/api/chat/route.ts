import { handleChatTurn } from "@/lib/chatService";
import { providersFromEnv } from "@/lib/llm";
import { checkRateLimit } from "@/lib/rateLimit";
import { ChatRequestSchema } from "@/lib/schema";

/** Worst case is several providers timing out in turn; give the chain room on serverless hosts. */
export const maxDuration = 60;

/**
 * POST /api/chat
 * Request:  ChatRequest  { messages, state }   (see lib/schema.ts)
 * Response: ChatResponse { reply, state, applied, rejected, meta }
 * Errors:   400 invalid request, 429 rate limited, 500 unexpected. Body: { error }
 *
 * Orchestration only: validate input, call the service, shape the HTTP response.
 */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!checkRateLimit(ip)) {
    return Response.json({ error: "Too many requests. Please wait a minute." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return Response.json(
      { error: `Invalid request: ${issue.path.join(".") || "(root)"}: ${issue.message}` },
      { status: 400 },
    );
  }

  try {
    return Response.json(await handleChatTurn(parsed.data, providersFromEnv()));
  } catch (err) {
    console.error("Unexpected error in /api/chat", err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
