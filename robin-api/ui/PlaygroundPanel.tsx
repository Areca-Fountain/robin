"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ENDPOINTS } from "@/robin-api/spec";

interface Result {
  status: number;
  ms: number;
  rateRemaining: string | null;
  full: string;
  shown: string;
}

/** Long values (the PDF, the transaction) are cut for display. Copy keeps everything. */
function shorten(value: unknown): unknown {
  if (typeof value === "string") return value.length > 160 ? `${value.slice(0, 120)}… (${value.length} characters)` : value;
  if (Array.isArray(value)) return value.map(shorten);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shorten(v)]));
  }
  return value;
}

export default function PlaygroundPanel() {
  const [apiKey, setApiKey] = useState("");
  const [endpointId, setEndpointId] = useState(ENDPOINTS[0].id);
  const endpoint = ENDPOINTS.find((e) => e.id === endpointId) ?? ENDPOINTS[0];
  const [path, setPath] = useState(ENDPOINTS[0].path);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);

  function pick(id: string) {
    const e = ENDPOINTS.find((x) => x.id === id) ?? ENDPOINTS[0];
    setEndpointId(e.id);
    setPath(e.path);
    setBody(e.exampleBody ? JSON.stringify(e.exampleBody, null, 2) : "");
    setResult(null);
    setError("");
  }

  async function send() {
    setError("");
    setResult(null);
    if (!/^rbn_[A-Za-z0-9_-]{40}$/.test(apiKey.trim())) {
      setError("Paste a full API key (it starts with rbn_ and is 44 characters long).");
      return;
    }
    if (path.includes("{")) {
      setError("Replace {id} in the path with a real letter id.");
      return;
    }
    let payload: string | undefined;
    if (endpoint.method === "POST") {
      try {
        payload = JSON.stringify(JSON.parse(body || "{}"));
      } catch {
        setError("The request body is not valid JSON.");
        return;
      }
    }

    setBusy(true);
    const started = performance.now();
    try {
      const res = await fetch(path, {
        method: endpoint.method,
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          ...(payload ? { "Content-Type": "application/json" } : {}),
        },
        body: payload,
      });
      const text = await res.text();
      let shown = text;
      let full = text;
      try {
        const json = JSON.parse(text);
        full = JSON.stringify(json, null, 2);
        shown = JSON.stringify(shorten(json), null, 2);
      } catch {
        /* not JSON: show as it is */
      }
      setResult({
        status: res.status,
        ms: Math.round(performance.now() - started),
        rateRemaining: res.headers.get("x-ratelimit-remaining"),
        full,
        shown,
      });
    } catch {
      setError("The request could not be sent. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.full);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy automatically.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Playground</h1>
        <p className="mt-1 text-slate-600">Try the API from your browser with one of your keys.</p>
      </div>

      <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        This sends real calls. Preparing a letter only makes a draft: nothing goes on the blockchain until your wallet
        signs and submits the transaction. The key is kept in this page only and is never saved.
      </p>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Request</CardTitle>
          <CardDescription>{endpoint.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pgKey">API key</Label>
            <Input
              id="pgKey"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="rbn_…"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pgEndpoint">Endpoint</Label>
            <select
              id="pgEndpoint"
              value={endpointId}
              onChange={(e) => pick(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
            >
              {ENDPOINTS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.method} {e.path} — {e.summary}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pgPath">Path</Label>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{endpoint.method}</Badge>
              <Input id="pgPath" value={path} onChange={(e) => setPath(e.target.value)} className="font-mono text-xs" />
            </div>
            {endpoint.path.includes("{id}") && (
              <p className="text-xs text-slate-500">Replace {"{id}"} with a letter id (you can add ?limit=5 style queries too).</p>
            )}
          </div>

          {endpoint.method === "POST" && (
            <div className="space-y-1.5">
              <Label htmlFor="pgBody">JSON body</Label>
              <textarea
                id="pgBody"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                spellCheck={false}
                className="w-full rounded-md border border-slate-300 bg-white p-2 font-mono text-xs"
              />
            </div>
          )}

          <Button onClick={() => void send()} disabled={busy} className="bg-indigo-600 hover:bg-indigo-700">
            {busy ? "Sending…" : "Send"}
          </Button>

          {error && (
            <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
              Response
              <Badge
                className={
                  result.status >= 500
                    ? "bg-red-600 text-white"
                    : result.status >= 400
                      ? "bg-amber-500 text-white"
                      : "bg-emerald-600 text-white"
                }
              >
                {result.status}
              </Badge>
              <span className="text-xs font-normal text-slate-500">
                {result.ms} ms{result.rateRemaining !== null ? ` · ${result.rateRemaining} calls left this minute` : ""}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <pre className="max-h-96 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">{result.shown}</pre>
            <Button variant="outline" size="sm" onClick={() => void copy()}>
              {copied ? "Copied!" : "Copy full response"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
