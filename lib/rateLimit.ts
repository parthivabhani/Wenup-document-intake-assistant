/**
 * Minimal fixed-window, per-IP rate limiter to stop a public demo from burning
 * through the free LLM quota. In-memory, so it's per server instance only;
 * production would use a shared store (e.g. Redis) instead.
 */
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;
const hits = new Map<string, { count: number; windowStart: number }>();

export function checkRateLimit(key: string, now = Date.now()): boolean {
  const entry = hits.get(key);
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    hits.set(key, { count: 1, windowStart: now });
    if (hits.size > 10_000) hits.clear(); // crude memory bound
    return true;
  }
  entry.count++;
  return entry.count <= MAX_REQUESTS;
}
