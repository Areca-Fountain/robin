"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useCompany } from "@/components/dashboard/CompanyProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MAX_BODY_LENGTH,
  PLACEHOLDERS,
  STARTER_BODY,
  validateFormat,
} from "@/lib/letter-format";

interface Format {
  id: string;
  name: string;
  body: string;
  signerName: string;
  signerTitle: string;
  status: "Draft" | "Generated";
  updatedAt: string;
}

const textareaClass =
  "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm font-mono outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export default function FormatsPage() {
  const { me, authFetch, refresh } = useCompany();
  const [formats, setFormats] = useState<Format[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Editor
  const [editing, setEditing] = useState(false);
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [signerName, setSignerName] = useState("");
  const [signerTitle, setSignerTitle] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await authFetch("/api/formats", { action: "list" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load formats.");
      setFormats(data.formats as Format[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load formats.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  function openEditor(f?: Format) {
    setError("");
    setMessage("");
    setId(f?.id ?? "");
    setName(f?.name ?? "");
    setBody(f?.body ?? STARTER_BODY);
    setSignerName(f?.signerName ?? me?.company.name ?? "");
    setSignerTitle(f?.signerTitle ?? "");
    setEditing(true);
  }

  async function call(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await authFetch("/api/formats", { action, ...extra });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    const problem = validateFormat({ name, body, signerName, signerTitle });
    if (problem) {
      setError(problem);
      return;
    }
    const data = await call("save", { id, name, body, signerName, signerTitle });
    if (data) {
      setEditing(false);
      setMessage("Format saved as a draft. Press Generate to make it ready for issuing.");
      await load();
      await refresh();
    }
  }

  async function handleGenerate(f: Format) {
    const data = await call("generate", { id: f.id });
    if (data) {
      setMessage(`"${f.name}" is ready. It now appears in Issue Service Letter.`);
      await load();
      await refresh();
    }
  }

  async function handleDelete(f: Format) {
    if (!window.confirm(`Delete the format "${f.name}"? Letters already issued are not affected.`)) return;
    const data = await call("delete", { id: f.id });
    if (data) {
      await load();
      await refresh();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Manage Formats</h1>
          <p className="mt-1 text-slate-600">
            Create the wording of your service letters once. Press Generate to make a format
            available in Issue Service Letter.
          </p>
        </div>
        {!editing && (
          <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => openEditor()}>
            New format
          </Button>
        )}
      </div>

      {message && (
        <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}

      {editing && (
        <form onSubmit={handleSave}>
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">{id ? "Edit format" : "New format"}</CardTitle>
              <CardDescription>
                Type the letter text and use placeholders. Robin fills them in for each employee.
                Use English letters only.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Format name *</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Standard service letter" required />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="body">Letter text *</Label>
                <textarea
                  id="body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={9}
                  className={textareaClass}
                />
                <p className="text-xs text-slate-500">
                  {body.length} / {MAX_BODY_LENGTH} characters. A new line starts a new paragraph.
                </p>
              </div>

              <div className="rounded-lg bg-slate-100 p-3 text-xs text-slate-700">
                <p className="mb-1 font-semibold">Placeholders you can use</p>
                <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                  {PLACEHOLDERS.map((p) => (
                    <li key={p.key}>
                      <code className="rounded bg-white px-1">{`{{${p.key}}}`}</code> {p.label}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="signerName">Signed by (name) *</Label>
                  <Input id="signerName" value={signerName} onChange={(e) => setSignerName(e.target.value)} maxLength={80} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signerTitle">Title *</Label>
                  <Input id="signerTitle" value={signerTitle} onChange={(e) => setSignerTitle(e.target.value)} maxLength={80} placeholder="e.g. Head of HR" required />
                </div>
              </div>

              <div className="flex gap-3">
                <Button type="submit" disabled={busy} className="bg-indigo-600 hover:bg-indigo-700">
                  {busy ? "Saving…" : "Save format"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={busy}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      )}

      {!editing && (
        <div className="space-y-3">
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : formats.length === 0 ? (
            <Card className="border-dashed border-slate-300">
              <CardContent className="pt-4 text-sm text-slate-600">
                No formats yet. Press <strong>New format</strong> to start with a ready-made text.
              </CardContent>
            </Card>
          ) : (
            formats.map((f) => (
              <Card key={f.id} className="border-slate-200 shadow-sm">
                <CardContent className="space-y-3 pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900">{f.name}</p>
                      <Badge
                        className={f.status === "Generated" ? "bg-emerald-600 text-white" : "bg-slate-500 text-white"}
                      >
                        {f.status === "Generated" ? "Ready" : "Draft"}
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      {f.status === "Draft" && (
                        <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" disabled={busy} onClick={() => void handleGenerate(f)}>
                          Generate
                        </Button>
                      )}
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => openEditor(f)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="destructive" disabled={busy} onClick={() => void handleDelete(f)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                  <p className="line-clamp-3 whitespace-pre-line text-sm text-slate-600">{f.body}</p>
                  <p className="text-xs text-slate-500">
                    Signed by {f.signerName}, {f.signerTitle}
                  </p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}