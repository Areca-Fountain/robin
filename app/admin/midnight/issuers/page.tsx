"use client";

// Admin: register companies as issuers on the Midnight contract.
// Companies enroll from their dashboard; this page lists them and registers each one.

import { useCallback, useEffect, useState } from "react";
import RoleGate from "@/components/auth/RoleGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authedPost } from "@/lib/client-auth";
import { supabase } from "@/lib/supabase";
import { connectLaceMidnight } from "@/lib/midnight/lace-connector";
import { MIDNIGHT_CONTRACT_ADDRESS } from "@/lib/midnight/config";
import { randomBytes32 } from "../../../../midnight/witnesses";
import { isHex32, toHex } from "@/lib/midnight/credential";

interface IssuerRow {
  company_id: string;
  issuer_id: string;
  status: "pending" | "registered" | "removed";
  registered_tx: string | null;
  updated_at: string;
  companyName: string | null;
}

function errText(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const cause = (e as Error & { cause?: unknown }).cause;
  return cause instanceof Error ? `${e.message} (${cause.message})` : e.message;
}

export default function RegisterIssuerPage() {
  return (
    <RoleGate role="admin">
      <RegisterIssuers />
    </RoleGate>
  );
}

function RegisterIssuers() {
  const [adminSecret, setAdminSecret] = useState("");
  const [rows, setRows] = useState<IssuerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [log, setLog] = useState<string[]>([]);

  // advanced / testing
  const [manualCompanyId, setManualCompanyId] = useState("");
  const [manualIssuerId, setManualIssuerId] = useState("");
  const [testSecret, setTestSecret] = useState("");

  const add = (m: string) => setLog((l) => [...l, m]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/midnight/issuers", {
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not load companies.");
      setRows((json.issuers as IssuerRow[]) ?? []);
    } catch (e) {
      add(`ERROR: ${errText(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSecretFile(file: File | undefined) {
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      if (!isHex32(json.adminSecret ?? "")) throw new Error("adminSecret is not 64 hex characters.");
      setAdminSecret(json.adminSecret);
      add("Admin secret loaded (kept in memory only, never uploaded).");
      if (json.contractAddress && json.contractAddress !== MIDNIGHT_CONTRACT_ADDRESS) {
        add("WARNING: the file's contract address differs from NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS.");
      }
    } catch (e) {
      add(`ERROR reading secret file: ${errText(e)}`);
    }
  }

  /** Registers one issuer on-chain, then marks it registered in the database. */
  async function register(issuerId: string, companyId: string, label: string) {
    setWorkingId(issuerId);
    try {
      if (!MIDNIGHT_CONTRACT_ADDRESS) throw new Error("NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS is not set.");
      if (!isHex32(adminSecret)) throw new Error("Load the admin secret file first.");
      if (!isHex32(issuerId)) throw new Error("issuerId must be 64 hex characters.");

      add(`${label}: connecting to your Midnight wallet...`);
      const wallet = await connectLaceMidnight();

      add(`${label}: calling registerIssuer. Approve in your wallet; proving can take a minute...`);
      const { callRegisterIssuer } = await import("@/lib/midnight/contract-api");
      const txId = await callRegisterIssuer(wallet, adminSecret, issuerId.trim().toLowerCase());
      add(`${label}: registered on-chain. tx: ${txId}`);

      if (companyId.trim()) {
        const res = await authedPost("/api/midnight/issuers", {
          action: "confirm_onchain",
          companyId: companyId.trim(),
          registeredTx: txId,
        });
        const json = await res.json().catch(() => ({}));
        add(
          res.ok
            ? `${label}: database updated, status = registered.`
            : `${label}: database NOT updated: ${json.error ?? res.status}`
        );
      }
      await load();
    } catch (e) {
      add(`${label}: ERROR: ${errText(e)}`);
      console.error(e);
    } finally {
      setWorkingId("");
    }
  }

  async function makeTestIssuer() {
    try {
      const secret = randomBytes32();
      const mod: any = await import("../../../../midnight/managed/robin_private/contract/index.js");
      const id: Uint8Array = mod.pureCircuits.issuerIdOf(secret);
      setTestSecret(toHex(secret));
      setManualIssuerId(toHex(id));
      add("Test issuer created. Download its secret: it is needed to issue letters as this test issuer.");
    } catch (e) {
      add(`ERROR: ${errText(e)}`);
    }
  }

  function downloadTestSecret() {
    const blob = new Blob([JSON.stringify({ issuerSecret: testSecret, issuerId: manualIssuerId }, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "robin-test-issuer-secret.json";
    a.click();
  }

  const pending = rows.filter((r) => r.status === "pending");
  const done = rows.filter((r) => r.status !== "pending");

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Midnight issuers</h1>
        <p className="mt-1 text-sm text-slate-600">
          Companies that enrolled a private-letter key. Register each one on the Midnight contract so
          its letters are accepted.
        </p>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">1. Admin secret</CardTitle>
          <CardDescription>
            The file from the deploy page (robin-midnight-admin-secret.json). It stays in this tab only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input type="file" accept="application/json" onChange={(e) => void onSecretFile(e.target.files?.[0])} />
          <p className="text-sm text-slate-600">{adminSecret ? "Loaded." : "Not loaded."}</p>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-lg">2. Waiting for registration ({pending.length})</CardTitle>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? "Loading..." : "Refresh"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!loading && pending.length === 0 && (
            <p className="text-sm text-slate-500">No companies are waiting.</p>
          )}
          {pending.map((r) => (
            <div key={r.company_id} className="rounded-lg border border-slate-200 p-3">
              <p className="font-medium text-slate-900">{r.companyName ?? "Unknown company"}</p>
              <p className="break-all text-xs text-slate-500">Company ID: {r.company_id}</p>
              <p className="break-all font-mono text-xs text-slate-500">Issuer ID: {r.issuer_id}</p>
              <Button
                className="mt-2"
                size="sm"
                disabled={!adminSecret || Boolean(workingId)}
                onClick={() => void register(r.issuer_id, r.company_id, r.companyName ?? r.company_id)}
              >
                {workingId === r.issuer_id ? "Working..." : "Register on Midnight"}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Already handled ({done.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {done.length === 0 && <p className="text-sm text-slate-500">Nothing yet.</p>}
          {done.map((r) => (
            <div key={r.company_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium text-slate-900">{r.companyName ?? r.company_id}</span>
              <Badge className={r.status === "registered" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}>
                {r.status}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <details className="rounded-lg border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">
          Advanced: register by hand or create a test issuer
        </summary>
        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="mCompany">Company ID (optional, updates the database)</Label>
            <Input id="mCompany" value={manualCompanyId} onChange={(e) => setManualCompanyId(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mIssuer">Issuer ID (64 hex)</Label>
            <Input id="mIssuer" value={manualIssuerId} onChange={(e) => setManualIssuerId(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void makeTestIssuer()}>
              Generate test issuer
            </Button>
            {testSecret && (
              <Button variant="outline" size="sm" onClick={downloadTestSecret}>
                Download test issuer secret
              </Button>
            )}
            <Button
              size="sm"
              disabled={!adminSecret || Boolean(workingId)}
              onClick={() => void register(manualIssuerId, manualCompanyId, "Manual")}
            >
              Register on Midnight
            </Button>
          </div>
        </div>
      </details>

      <pre className="whitespace-pre-wrap rounded border bg-white p-3 text-sm">
        {log.join("\n") || "Activity appears here."}
      </pre>
    </main>
  );
}