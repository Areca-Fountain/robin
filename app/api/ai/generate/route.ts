import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCompany, errorResponse } from "@/lib/auth-server";
import { generateAiLines, AiError, type AiLineRequest } from "@/lib/ai-letter";
import { durationText, isAiDesignation, normalizePerformance } from "@/lib/ai-eligibility";

const BULK_CHUNK = 20; // rows the browser may send per request
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Very simple per-company limit so nobody can burn the AI quota: 40 AI calls / 10 minutes */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_CALLS = 40;
const calls = new Map<string, number[]>();

function rateLimited(companyId: string): boolean {
  const now = Date.now();
  const recent = (calls.get(companyId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_CALLS) {
    calls.set(companyId, recent);
    return true;
  }
  recent.push(now);
  calls.set(companyId, recent);
  return false;
}

/**
 * POST /api/ai/generate   (needs the Google login token)
 * Body: { mode: "single" | "bulk", items: [{ position, startDate, endDate, stillEmployed }] }
 * Returns: { lines: (string | null)[] }   one entry per item, same order.
 * A line is null when the AI gave nothing usable.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireCompany(req);
    const body = await req.json().catch(() => ({}));
    const bad = (error: string, status = 400) => Response.json({ error }, { status });

    const mode = body.mode === "bulk" ? "bulk" : "single";
    const items: unknown[] = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) return bad("Nothing to generate.");
    if (mode === "single" && items.length !== 1) return bad("Single mode takes exactly one item.");
    if (mode === "bulk" && items.length > BULK_CHUNK) return bad(`Send at most ${BULK_CHUNK} rows per request.`);

    if (mode === "bulk") {
      const { data } = await getSupabaseAdmin()
        .from("company_applications")
        .select("subscription_plan")
        .eq("id", ctx.companyId)
        .maybeSingle();
      if (data?.subscription_plan !== "Premium") {
        return bad("Bulk generation with Robin AI is for Premium companies. Please upgrade.", 403);
      }
    }

    // Validate + build one request per item
    const prepared = items.map((raw, i) => {
      const it = (raw ?? {}) as Record<string, unknown>;
      const position = typeof it.position === "string" ? it.position.trim() : "";
      const startDate = typeof it.startDate === "string" ? it.startDate : "";
      const endDate = typeof it.endDate === "string" ? it.endDate : "";
      const stillEmployed = it.stillEmployed === true;
      const keyDuty = (typeof it.keyDuty === "string" ? it.keyDuty : "")
        .replace(/[^\p{L}\p{N} .,&'/()-]/gu, "")
        .trim()
        .slice(0, 100);
      const performance = normalizePerformance(it.performance);

      if (!position || position.length > 120) throw new AiError(`Item ${i + 1}: position is required (max 120 characters).`);
      if (!DATE_RE.test(startDate)) throw new AiError(`Item ${i + 1}: start date must be YYYY-MM-DD.`);
      if (endDate && !DATE_RE.test(endDate)) throw new AiError(`Item ${i + 1}: end date must be YYYY-MM-DD.`);

      const eligible = isAiDesignation(position);
      const safeTitle = position.replace(/[^\p{L}\p{N} .,&'/()-]/gu, "").slice(0, 80);
      const duration = durationText(startDate, stillEmployed || !endDate ? null : endDate);
      return { eligible, request: { position: safeTitle, duration, stillEmployed, keyDuty, performance } satisfies AiLineRequest };
    });

    // Same title + same duration = one AI line, so bulk uploads cost very few tokens
    const unique = new Map<string, AiLineRequest>();
    const keyOf = (r: AiLineRequest) => `${r.position.toLowerCase()}|${r.duration}|${r.stillEmployed}|${r.keyDuty.toLowerCase()}|${r.performance}`;
    for (const p of prepared) if (p.eligible) unique.set(keyOf(p.request), p.request);

    const lineByKey = new Map<string, string | null>();
    if (unique.size > 0) {
      if (rateLimited(ctx.companyId)) {
        return bad("Too many AI requests. Please wait a few minutes and try again.", 429);
      }
      const keys = [...unique.keys()];
      const generated = await generateAiLines(keys.map((k) => unique.get(k)!));
      keys.forEach((k, i) => lineByKey.set(k, generated[i] ?? null));
    }

    const lines = prepared.map((p) => (p.eligible ? lineByKey.get(keyOf(p.request)) ?? null : null));
    return Response.json({ lines });
  } catch (err) {
    if (err instanceof AiError) {
      const status = /unavailable|busy|in time/i.test(err.message) ? 502 : /not set up/i.test(err.message) ? 503 : 400;
      return Response.json({ error: err.message }, { status });
    }
    return errorResponse(err, "Could not generate the text.");
  }
}