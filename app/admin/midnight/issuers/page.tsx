"use client";

import { useState } from "react";
import RoleGate from "@/components/auth/RoleGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authedPost } from "@/lib/client-auth";
import { supabase } from "@/lib/supabase";
import { connectLaceMidnight } from "@/lib/midnight/lace-connector";
import { MIDNIGHT_CONTRACT_ADDRESS } from "@/lib/midnight/config";
import { randomBytes32 } from "../../../../midnight/witnesses";
import { isHex32, toHex } from "@/lib/midnight/credential";

export default function RegisterIssuerPage() {
  return (
    <RoleGate role="admin">
      <RegisterIssuer />
    </RoleGate>
  );
}

function RegisterIssuer() {
  const [adminSecret, setAdminSecret] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [issuerId, setIssuerId] = useState("");
  const [testSecret, setTestSecret] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const add = (m: string) => setLog((l) => [...l, m]);

  // ---- 1. load the admin secret file downloaded on the deploy page ----
  async function onSecretFile(file: File | undefined) {
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      if (!isHex32(json.adminSecret ?? "")) throw new Error("adminSecret is not 64 hex characters.");
      setAdminSecret(json.adminSecret);
      add("Admin secret loaded (kept in memory only).");
      if (json.contractAddress && json.contractAddress !== MIDNIGHT_CONTRACT_ADDRESS) {
        add(
          "WARNING: the file's contract address differs from NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS in .env.local."
        );
      }
    } catch (e) {
      add(`ERROR reading secret file: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ---- 2. look up a company's pending issuerId ----
  async function lookup() {
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch(`/api/midnight/issuers?companyId=${encodeURIComponent(companyId.trim())}`, {
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Lookup failed.");
      if (!json.issuer) {
        add("No issuer found for that company. It has not enrolled yet. Paste an issuerId manually to test.");
      } else {
        setIssuerId(json.issuer.issuer_id);
        add(`Found issuer (status: ${json.issuer.status}).`);
      }
    } catch (e) {
      add(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  // ---- 3. TEST helper: make a throw-away issuer secret + its issuerId ----
  async function makeTestIssuer() {
    try {
      const secret = randomBytes32();
      const mod: any = await import("../../../../midnight/managed/robin_private/contract/index.js");
      const id: Uint8Array = mod.pureCircuits.issuerIdOf(secret);
      setTestSecret(toHex(secret));
      setIssuerId(toHex(id));
      add("Test issuer created. Download its secret: you need it later to issue letters as this company.");
    } catch (e) {
      add(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function downloadTestSecret() {
    const blob = new Blob([JSON.stringify({ issuerSecret: testSecret, issuerId }, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "robin-test-issuer-secret.json";
    a.click();
  }

  // ---- 4. register on the Midnight contract ----
  async function register() {
    setBusy(true);
    try {
      if (!MIDNIGHT_CONTRACT_ADDRESS) throw new Error("NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS is not set.");
      if (!isHex32(adminSecret)) throw new Error("Load the admin secret file first.");
      if (!isHex32(issuerId)) throw new Error("issuerId must be 64 hex characters.");

      add("Connecting to Lace (Midnight Preprod)...");
      const wallet = await connectLaceMidnight();

      add("Calling registerIssuer. Approve in Lace; proving can take a minute...");
      const { callRegisterIssuer } = await import("@/lib/midnight/contract-api");
      const txId = await callRegisterIssuer(wallet, adminSecret, issuerId.trim().toLowerCase());
      add(`Registered on-chain. tx: ${txId}`);

      if (companyId.trim()) {
        const res = await authedPost("/api/midnight/issuers", {
          action: "confirm_onchain",
          companyId: companyId.trim(),
          registeredTx: txId,
        });
        const json = await res.json().catch(() => ({}));
        add(res.ok ? "Database updated: status = registered." : `Database not updated: ${json.error ?? res.status}`);
      } else {
        add("No company ID entered, so the database was not updated (fine for a chain-only test).");
      }
    } catch (e) {
      add(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
      const cause = e instanceof Error ? (e as Error & { cause?: unknown }).cause : undefined;
      if (cause) add(`CAUSE: ${cause instanceof Error ? cause.message : String(cause)}`);
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Register company as issuer (Midnight Preprod)</h1>

      <section className="space-y-2">
        <Label>1. Admin secret file (from the deploy page)</Label>
        <Input type="file" accept="application/json" onChange={(e) => onSecretFile(e.target.files?.[0])} />
        <p className="text-sm">{adminSecret ? "Loaded." : "Not loaded."}</p>
      </section>

      <section className="space-y-2">
        <Label htmlFor="companyId">2. Company ID (optional; used to look up and update the database)</Label>
        <div className="flex gap-2">
          <Input id="companyId" value={companyId} onChange={(e) => setCompanyId(e.target.value)} />
          <Button variant="outline" onClick={lookup} disabled={busy || !companyId.trim()}>
            Look up
          </Button>
        </div>
      </section>

      <section className="space-y-2">
        <Label htmlFor="issuerId">3. Issuer ID (64 hex)</Label>
        <Input id="issuerId" value={issuerId} onChange={(e) => setIssuerId(e.target.value)} />
        <div className="flex gap-2">
          <Button variant="outline" onClick={makeTestIssuer} disabled={busy}>
            Generate test issuer
          </Button>
          {testSecret && (
            <Button variant="outline" onClick={downloadTestSecret}>
              Download test issuer secret
            </Button>
          )}
        </div>
      </section>

      <Button onClick={register} disabled={busy}>
        {busy ? "Working..." : "Register issuer on Midnight"}
      </Button>

      <pre className="whitespace-pre-wrap rounded border p-3 text-sm">{log.join("\n") || "Logs appear here."}</pre>
    </main>
  );
}