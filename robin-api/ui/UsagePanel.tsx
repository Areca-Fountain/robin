"use client";

import { useCallback, useEffect, useState } from "react";
import { useCompany } from "@/components/dashboard/CompanyProvider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Usage {
  calls24h: number;
  errors24h: number;
  calls7d: number;
  byDay: { date: string; count: number }[];
  byEndpoint: { endpoint: string; count: number }[];
  byKey: { name: string; count: number }[];
  recent: { at: string; method: string; path: string; status: number; ms: number | null; key: string }[];
}

function statusClass(status: number) {
  if (status >= 500) return "bg-red-600 text-white";
  if (status >= 400) return "bg-amber-500 text-white";
  return "bg-emerald-600 text-white";
}

export default function UsagePanel() {
  const { authFetch } = useCompany();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch("/api/company/api-usage", {});
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load usage.");
      setUsage(data as Usage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load usage.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxDay = Math.max(1, ...(usage?.byDay.map((d) => d.count) ?? [1]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">API usage</h1>
          <p className="mt-1 text-slate-600">What your software has been doing with the Robin API.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}

      {usage && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "Calls, last 24 hours", value: usage.calls24h },
              { label: "Errors, last 24 hours", value: usage.errors24h },
              { label: "Calls, last 7 days", value: usage.calls7d },
            ].map((s) => (
              <Card key={s.label} className="border-slate-200 shadow-sm">
                <CardContent className="pt-6">
                  <p className="text-3xl font-bold text-slate-900">{s.value}</p>
                  <p className="mt-1 text-xs text-slate-500">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Calls per day</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex h-32 items-end gap-2">
                {usage.byDay.map((d) => (
                  <div key={d.date} className="flex flex-1 flex-col items-center justify-end gap-1">
                    <span className="text-[11px] text-slate-600">{d.count}</span>
                    <div
                      className="w-full rounded-t bg-indigo-500"
                      style={{ height: `${Math.max(2, (d.count / maxDay) * 90)}px` }}
                    />
                    <span className="text-[10px] text-slate-500">{d.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Busiest endpoints</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {usage.byEndpoint.length === 0 && <p className="text-slate-500">No calls yet.</p>}
                {usage.byEndpoint.map((e) => (
                  <div key={e.endpoint} className="flex justify-between gap-2">
                    <span className="break-all font-mono text-xs text-slate-700">{e.endpoint}</span>
                    <span className="font-medium">{e.count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">By key</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {usage.byKey.length === 0 && <p className="text-slate-500">No calls yet.</p>}
                {usage.byKey.map((k) => (
                  <div key={k.name} className="flex justify-between gap-2">
                    <span className="text-slate-700">{k.name}</span>
                    <span className="font-medium">{k.count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Latest calls</CardTitle>
              <CardDescription>The 25 most recent. Letter ids are hidden on purpose.</CardDescription>
            </CardHeader>
            <CardContent>
              {usage.recent.length === 0 ? (
                <p className="text-sm text-slate-500">No calls yet. Try the Playground tab.</p>
              ) : (
                <div className="divide-y">
                  {usage.recent.map((r, i) => (
                    <div key={`${r.at}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <p className="break-all font-mono text-xs text-slate-800">
                          {r.method} {r.path}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {new Date(r.at).toLocaleString()} · {r.key}
                          {r.ms !== null ? ` · ${r.ms} ms` : ""}
                        </p>
                      </div>
                      <Badge className={`text-xs ${statusClass(r.status)}`}>{r.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
