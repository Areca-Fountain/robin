"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useCompany } from "@/components/dashboard/CompanyProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Member {
  id: string;
  email: string;
  role: "secondary" | "team";
}

export default function DashboardSettingsPage() {
  const { me, authFetch } = useCompany();
  const [secondary, setSecondary] = useState<Member | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refreshMembers = useCallback(async () => {
    try {
      const res = await authFetch("/api/team", { action: "list" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load settings.");
      setSecondary((data.members as Member[]).find((m) => m.role === "secondary") ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load settings.");
    }
  }, [authFetch]);

  useEffect(() => {
    let active = true;

    async function fetchInitial() {
      try {
        const res = await authFetch("/api/team", { action: "list" });
        const data = await res.json();
        if (!active) return;
        if (!res.ok) throw new Error(data.error ?? "Could not load settings.");
        setSecondary((data.members as Member[]).find((m) => m.role === "secondary") ?? null);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Could not load settings.");
        }
      }
    }

    void fetchInitial();

    return () => {
      active = false;
    };
  }, [authFetch]);

  async function call(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const res = await authFetch("/api/team", body);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      await refreshMembers();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (await call({ action: "add", role: "secondary", email })) setEmail("");
  }

  if (!me) return null;
  const isPrimary = me.role === "primary";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Account Settings</h1>
        <p className="mt-1 text-slate-600">Only the primary and secondary accounts can see this page.</p>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Primary account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="text-slate-500">Company</p>
            <p className="font-medium text-slate-900">{me.company.name}</p>
          </div>
          <div>
            <p className="text-slate-500">Primary email</p>
            <p className="break-all font-medium text-slate-900">{me.company.primaryEmail}</p>
          </div>
          <div>
            <p className="text-slate-500">Connected wallet</p>
            <code className="block break-all rounded bg-slate-100 p-2 text-xs text-slate-700">
              {me.company.walletAddress || "No wallet on file"}
            </code>
            <p className="mt-1 text-xs text-slate-500">
              Letters must be signed with this wallet. To change it, contact Robin&apos;s team.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Secondary Gmail account</CardTitle>
          <CardDescription>
            A backup Google account with the same access as the primary one. Only one is allowed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {secondary ? (
            <div className="flex items-center justify-between gap-3">
              <span className="break-all text-sm text-slate-900">{secondary.email}</span>
              {isPrimary && (
                <Button size="sm" variant="destructive" disabled={busy} onClick={() => void call({ action: "remove", id: secondary.id })}>
                  Remove
                </Button>
              )}
            </div>
          ) : isPrimary ? (
            <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
              <div className="min-w-60 flex-1 space-y-1.5">
                <Label htmlFor="secondary">Gmail address</Label>
                <Input id="secondary" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="backup@gmail.com" required />
              </div>
              <Button type="submit" disabled={busy} className="bg-indigo-600 hover:bg-indigo-700">
                {busy ? "Adding…" : "Add"}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-slate-500">No secondary account set.</p>
          )}
          {error && (
            <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}