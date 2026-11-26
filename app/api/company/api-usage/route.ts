import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCompany, requireOwner, errorResponse } from "@/lib/auth-server";

interface LogRow {
  key_id: string | null;
  method: string;
  path: string;
  status: number;
  duration_ms: number | null;
  created_at: string;
}

/**
 * POST /api/company/api-usage   (needs the Google login token)
 * Usage numbers for the dashboard "Usage" tab. Owner accounts only (not team).
 * Looks at the last 7 days of this company's API calls.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireCompany(req);
    requireOwner(ctx);

    const supabase = getSupabaseAdmin();
    const now = Date.now();
    const since7 = new Date(now - 7 * 86_400_000).toISOString();
    const since24 = now - 86_400_000;

    const [logsRes, keysRes] = await Promise.all([
      supabase
        .from("api_request_logs")
        .select("key_id, method, path, status, duration_ms, created_at")
        .eq("company_id", ctx.companyId)
        .gte("created_at", since7)
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase.from("api_keys").select("id, name").eq("company_id", ctx.companyId),
    ]);
    if (logsRes.error) {
      // Most likely the 005 migration has not been run yet
      return Response.json(
        { error: "Usage data is not available yet. Run supabase/005_api_request_logs.sql in Supabase." },
        { status: 503 }
      );
    }
    if (keysRes.error) throw keysRes.error;

    const keyName = new Map<string, string>(
      ((keysRes.data ?? []) as { id: string; name: string }[]).map((k): [string, string] => [k.id, k.name])
    );
    const logs = (logsRes.data ?? []) as LogRow[];

    let calls24h = 0;
    let errors24h = 0;
    const byDay = new Map<string, number>();
    const byEndpoint = new Map<string, number>();
    const byKey = new Map<string, number>();

    for (let i = 6; i >= 0; i--) {
      byDay.set(new Date(now - i * 86_400_000).toISOString().slice(0, 10), 0);
    }
    for (const l of logs) {
      const t = new Date(l.created_at as string).getTime();
      const day = (l.created_at as string).slice(0, 10);
      if (byDay.has(day)) byDay.set(day, (byDay.get(day) ?? 0) + 1);
      const endpoint = `${l.method} ${l.path}`;
      byEndpoint.set(endpoint, (byEndpoint.get(endpoint) ?? 0) + 1);
      const name = keyName.get(l.key_id ?? "") ?? "Deleted key";
      byKey.set(name, (byKey.get(name) ?? 0) + 1);
      if (t >= since24) {
        calls24h++;
        if ((l.status as number) >= 400) errors24h++;
      }
    }

    const top = (m: Map<string, number>, n: number) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

    return Response.json({
      calls24h,
      errors24h,
      calls7d: logs.length,
      byDay: [...byDay.entries()].map(([date, count]) => ({ date, count })),
      byEndpoint: top(byEndpoint, 8).map(([endpoint, count]) => ({ endpoint, count })),
      byKey: top(byKey, 8).map(([name, count]) => ({ name, count })),
      recent: logs.slice(0, 25).map((l) => ({
        at: l.created_at as string,
        method: l.method as string,
        path: l.path as string,
        status: l.status as number,
        ms: (l.duration_ms as number | null) ?? null,
        key: keyName.get(l.key_id ?? "") ?? "Deleted key",
      })),
    });
  } catch (err) {
    return errorResponse(err, "Could not load API usage.");
  }
}
