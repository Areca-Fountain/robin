"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useCompany } from "@/components/dashboard/CompanyProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Member {
  id: string;
  email: string;
  role: "secondary" | "team";
  createdAt: string;
}

export default function TeamPage() {
  const { me, authFetch } = useCompany();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reloadTeam = useCallback(async () => {
    try {
      const res = await authFetch("/api/team", { action: "list" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load team.");
      setMembers((data.members as Member[]).filter((m) => m.role === "team"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load team.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    let active = true;
    async function initialLoad() {
      try {
        const res = await authFetch("/api/team", { action: "list" });
        const data = await res.json();
        if (!active) return;
        if (!res.ok) throw new Error(data.error ?? "Could not load team.");
        setMembers((data.members as Member[]).filter((m) => m.role === "team"));
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not load team.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialLoad();
    return () => {
      active = false;
    };
  }, [authFetch]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await authFetch("/api/team", {
        action: "add",
        role: "team",
        email,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add member.");
      setEmail("");
      await reloadTeam();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add member.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(id: string) {
    setBusy(true);
    setError("");
    try {
      const res = await authFetch("/api/team", { action: "remove", id });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not remove member.");
      await reloadTeam();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove member.");
    } finally {
      setBusy(false);
    }
  }

  if (!me) return null;

  if (me.role === "team") {
    return (
      <Card className="border-slate-200">
        <CardContent className="pt-6 text-sm text-slate-600">
          Only the primary and secondary accounts can manage team members.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Assign Team</h1>
        <p className="mt-1 text-slate-600">
          Add HR staff or coordinators by their Google email so they can create formats and issue service letters.
        </p>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Add team member</CardTitle>
          <CardDescription>
            Team members can manage formats and issue letters, but cannot change account settings or manage the team.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
            <div className="min-w-60 flex-1 space-y-1.5">
              <Label htmlFor="teamEmail">Member Gmail address</Label>
              <Input
                id="teamEmail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="hr.staff@gmail.com"
                required
              />
            </div>
            <Button type="submit" disabled={busy} className="bg-indigo-600 hover:bg-indigo-700">
              {busy ? "Adding…" : "Add member"}
            </Button>
          </form>
          {error && (
            <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Team members ({members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-slate-500">No team members added yet.</p>
          ) : (
            <div className="divide-y">
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">{m.email}</span>
                    <Badge variant="secondary" className="text-xs">Team</Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => void handleRemove(m.id)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}