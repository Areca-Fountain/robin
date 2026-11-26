"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useCompany } from "@/components/dashboard/CompanyProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdBy: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

interface NewKey {
  key: string;
  name: string;
}

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : "Never";
}

export default function ApiKeysPanel() {
  const { me, authFetch } = useCompany();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newKey, setNewKey] = useState<NewKey | null>(null);
  const [copied, setCopied] = useState(false);

  const reloadKeys = useCallback(async () => {
    try {
      const res = await authFetch("/api/company/api-keys", { action: "list" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load API keys.");
      setKeys(data.keys as ApiKeyRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load API keys.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    let active = true;
    async function initialLoad() {
      try {
        const res = await authFetch("/api/company/api-keys", { action: "list" });
        const data = await res.json();
        if (!active) return;
        if (!res.ok) throw new Error(data.error ?? "Could not load API keys.");
        setKeys(data.keys as ApiKeyRow[]);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not load API keys.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialLoad();
    return () => {
      active = false;
    };
  }, [authFetch]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      const res = await authFetch("/api/company/api-keys", { action: "create", name });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create the key.");
      setNewKey({ key: data.key as string, name: data.name as string });
      setName("");
      await reloadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the key.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(row: ApiKeyRow) {
    if (
      !window.confirm(
        `Revoke "${row.name}"? Any software using this key will stop working immediately.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await authFetch("/api/company/api-keys", { action: "revoke", id: row.id });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not revoke the key.");
      await reloadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke the key.");
    } finally {
      setBusy(false);
    }
  }

  async function copyKey() {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy automatically. Select the key and copy it by hand.");
    }
  }

  if (!me) return null;

  if (me.role === "team") {
    return (
      <Card className="border-slate-200">
        <CardContent className="pt-6 text-sm text-slate-600">
          Only the primary and secondary accounts can manage API keys.
        </CardContent>
      </Card>
    );
  }

  const activeCount = keys.filter((k) => !k.revokedAt).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">API Keys</h1>
        <p className="mt-1 text-slate-600">
          Use an API key to let your own software (HR system, website, scripts) work with Robin
          without logging in.
        </p>
      </div>

      {!me.company.verified && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your company is not verified yet. You can create keys now, but the API will only let you
          issue letters once Robin has verified your company.
        </p>
      )}

      {newKey && (
        <Card className="border-emerald-300 bg-emerald-50 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-emerald-900">Key created: {newKey.name}</CardTitle>
            <CardDescription className="text-emerald-800">
              Copy this key now and keep it secret. For your safety it is shown only once, and
              Robin cannot show it again.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <code className="block break-all rounded-md border border-emerald-300 bg-white px-3 py-2 text-sm text-slate-900">
              {newKey.key}
            </code>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void copyKey()}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {copied ? "Copied!" : "Copy key"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setNewKey(null)}>
                I have saved it
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Create a key</CardTitle>
          <CardDescription>
            Give it a name that tells you where it is used, for example &quot;HR system&quot;. You
            can have up to 5 active keys.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
            <div className="min-w-60 flex-1 space-y-1.5">
              <Label htmlFor="keyName">Key name</Label>
              <Input
                id="keyName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="HR system"
                maxLength={60}
                required
              />
            </div>
            <Button
              type="submit"
              disabled={busy || activeCount >= 5}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {busy ? "Working…" : "Create key"}
            </Button>
          </form>
          {activeCount >= 5 && (
            <p className="text-sm text-slate-600">
              You have reached the limit of 5 active keys. Revoke one to create another.
            </p>
          )}
          {error && (
            <p
              className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
              role="alert"
            >
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Your keys ({keys.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : keys.length === 0 ? (
            <p className="text-sm text-slate-500">No API keys yet.</p>
          ) : (
            <div className="divide-y">
              {keys.map((k) => (
                <div key={k.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">{k.name}</span>
                      {k.revokedAt ? (
                        <Badge variant="secondary" className="text-xs">Revoked</Badge>
                      ) : (
                        <Badge className="bg-emerald-600 text-xs text-white">Active</Badge>
                      )}
                    </div>
                    <p className="font-mono text-xs text-slate-600">{k.prefix}…</p>
                    <div className="flex flex-wrap gap-1.5">
                      {k.scopes.map((s) => (
                        <Badge key={s} variant="outline" className="text-[11px]">
                          {s}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500">
                      Created {formatDate(k.createdAt)}
                      {k.createdBy ? ` by ${k.createdBy}` : ""} · Last used {formatDate(k.lastUsedAt)}
                      {k.revokedAt ? ` · Revoked ${formatDate(k.revokedAt)}` : ""}
                    </p>
                  </div>
                  {!k.revokedAt && (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => void handleRevoke(k)}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">How to use a key</CardTitle>
          <CardDescription>
            Send the key in the Authorization header of every request to the Robin API.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
{`curl https://YOUR-ROBIN-DOMAIN/api/v1/me \\
  -H "Authorization: Bearer rbn_YOUR_KEY"`}
          </pre>
          <p className="mt-2 text-xs text-slate-500">
            Never put a key in website code that visitors can see, and never share it in chats or
            screenshots. If a key is exposed, revoke it here and create a new one.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}