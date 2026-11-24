"use client";

// Admin: deploy the robin_private contract to Midnight, one time.
//
// Flow:
//   1. Generate the admin secret (random 32 bytes, created in this tab).
//   2. Download it BEFORE deploying. It is the only key that can register issuers
//      and it is stored nowhere else.
//   3. Connect the Midnight wallet and deploy (the wallet asks for approval; proving
//      can take a minute or two).
//   4. Copy the contract address into NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS and
//      download the final robin-midnight-admin-secret.json (secret + address).
//   5. Continue to /admin/midnight/issuers.

import { useState } from "react";
import Link from "next/link";
import RoleGate from "@/components/auth/RoleGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { connectLaceMidnight, type ConnectedMidnightWallet } from "@/lib/midnight/lace-connector";
import { MIDNIGHT_CONTRACT_ADDRESS, MIDNIGHT_NETWORK_ID } from "@/lib/midnight/config";
import { toHex } from "@/lib/midnight/credential";
import { randomBytes32 } from "../../../midnight/witnesses";

function errText(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const cause = (e as Error & { cause?: unknown }).cause;
  return cause instanceof Error ? `${e.message} (${cause.message})` : e.message;
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function DeployMidnightPage() {
  return (
    <RoleGate role="admin">
      <DeployMidnight />
    </RoleGate>
  );
}

function DeployMidnight() {
  const [adminSecret, setAdminSecret] = useState(""); // 64 hex, memory only
  const [secretSaved, setSecretSaved] = useState(false);
  const [wallet, setWallet] = useState<ConnectedMidnightWallet | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [result, setResult] = useState<{ contractAddress: string; txId: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const add = (m: string) => setLog((l) => [...l, m]);
  const alreadyConfigured = Boolean(MIDNIGHT_CONTRACT_ADDRESS);

  function generateSecret() {
    if (adminSecret && !secretSaved) {
      const ok = window.confirm(
        "You have a secret that is not downloaded yet. Generating a new one discards it. Continue?"
      );
      if (!ok) return;
    }
    setAdminSecret(toHex(randomBytes32()));
    setSecretSaved(false);
    add("New admin secret generated. Download it before deploying.");
  }

  function downloadSecretOnly() {
    downloadJson("robin-midnight-admin-secret.json", {
      adminSecret,
      contractAddress: result?.contractAddress ?? "",
      network: MIDNIGHT_NETWORK_ID,
      ...(result ? { deployTx: result.txId } : {}),
      createdAt: new Date().toISOString(),
    });
    setSecretSaved(true);
    add(
      result
        ? "Admin secret file downloaded (with the contract address)."
        : "Admin secret file downloaded. Deploy next, then download it again to include the address."
    );
  }

  async function connect() {
    setConnecting(true);
    try {
      add("Connecting to your Midnight wallet...");
      const w = await connectLaceMidnight();
      setWallet(w);
      add(`Connected: ${w.walletName} on ${MIDNIGHT_NETWORK_ID}.`);
    } catch (e) {
      add(`ERROR: ${errText(e)}`);
      console.error(e);
    } finally {
      setConnecting(false);
    }
  }

  async function deploy() {
    if (!wallet || !adminSecret || !secretSaved) return;
    if (alreadyConfigured) {
      const ok = window.confirm(
        "NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS is already set. Deploying creates a NEW contract, and companies registered on the old one will need registering again. Deploy anyway?"
      );
      if (!ok) return;
    }
    setDeploying(true);
    try {
      add("Deploying robin_private. Approve in your wallet; proving can take a minute or two...");
      const { deployRobinPrivate } = await import("@/lib/midnight/contract-api");
      const { fromHex } = await import("@/lib/midnight/credential");
      const out = await deployRobinPrivate(wallet, fromHex(adminSecret));
      setResult(out);
      add(`Deployed. Contract address: ${out.contractAddress}`);
      add(`Deploy tx: ${out.txId}`);

      // Save a copy that includes the address right away.
      downloadJson("robin-midnight-admin-secret.json", {
        adminSecret,
        contractAddress: out.contractAddress,
        network: MIDNIGHT_NETWORK_ID,
        deployTx: out.txId,
        createdAt: new Date().toISOString(),
      });
      add("Downloaded robin-midnight-admin-secret.json with the contract address. Keep it safe.");
    } catch (e) {
      add(`ERROR: ${errText(e)}`);
      console.error(e);
    } finally {
      setDeploying(false);
    }
  }

  async function copyAddress() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.contractAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      add("Could not copy automatically. Select the address and copy it by hand.");
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Deploy the Midnight contract</h1>
        <p className="mt-1 text-sm text-slate-600">
          One-time setup. This publishes <span className="font-mono">robin_private</span> to the{" "}
          <span className="font-semibold">{MIDNIGHT_NETWORK_ID}</span> network and creates the admin key that
          registers verified companies.
        </p>
        <Link href="/admin/midnight/issuers" className="mt-2 inline-block text-sm text-indigo-600 hover:underline">
          Already deployed? Go to Midnight issuers
        </Link>
      </div>

      {alreadyConfigured && !result && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
          A contract address is already configured:{" "}
          <span className="break-all font-mono text-xs">{MIDNIGHT_CONTRACT_ADDRESS}</span>. Deploying again creates a
          new contract and the issuers you registered on the old one will need registering again.
        </div>
      )}

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-lg">1. Admin secret</CardTitle>
            {secretSaved && <Badge className="bg-emerald-600 text-white">Downloaded</Badge>}
          </div>
          <CardDescription>
            A random key made in this tab. It is the only thing that can register issuers and it is stored nowhere
            else, so download it before you deploy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={generateSecret} disabled={deploying || Boolean(result)}>
              {adminSecret ? "Generate a new secret" : "Generate admin secret"}
            </Button>
            <Button size="sm" onClick={downloadSecretOnly} disabled={!adminSecret}>
              Download admin secret
            </Button>
          </div>
          <p className="text-sm text-slate-600">
            {adminSecret
              ? "Secret ready (hidden). It never leaves this browser except in the file you download."
              : "No secret yet."}
          </p>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-lg">2. Midnight wallet</CardTitle>
            {wallet && <Badge className="bg-emerald-600 text-white">Connected</Badge>}
          </div>
          <CardDescription>
            Lace with Midnight enabled, on {MIDNIGHT_NETWORK_ID}, with tNIGHT and DUST to pay fees. The proof server
            must be running (Docker, port 6300).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button variant="outline" size="sm" onClick={() => void connect()} disabled={connecting || deploying}>
            {connecting ? "Connecting..." : wallet ? "Reconnect" : "Connect wallet"}
          </Button>
          {wallet && (
            <p className="break-all font-mono text-xs text-slate-500">{wallet.unshieldedAddress}</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">3. Deploy</CardTitle>
          <CardDescription>
            The wallet will ask you to approve. Keep this tab open until the address appears below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            onClick={() => void deploy()}
            disabled={!wallet || !adminSecret || !secretSaved || deploying || Boolean(result)}
          >
            {deploying ? "Deploying..." : result ? "Deployed" : "Deploy contract"}
          </Button>
          {!secretSaved && (
            <p className="text-sm text-slate-500">Download the admin secret first (step 1) to unlock this button.</p>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card className="border-emerald-300 bg-emerald-50 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-emerald-900">4. Deployed. Finish setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-800">
            <div>
              <p className="font-medium">Contract address</p>
              <p className="break-all rounded border bg-white p-2 font-mono text-xs">{result.contractAddress}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => void copyAddress()}>
                  {copied ? "Copied" : "Copy address"}
                </Button>
                <Button size="sm" variant="outline" onClick={downloadSecretOnly}>
                  Download admin secret again
                </Button>
              </div>
            </div>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Put the address in <span className="font-mono">.env.local</span> on one line, no quotes:
                <pre className="mt-1 overflow-x-auto rounded border bg-white p-2 text-xs">
                  NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS={result.contractAddress}
                </pre>
              </li>
              <li>On Vercel, add the same variable and redeploy.</li>
              <li>Restart <span className="font-mono">npm run dev</span> so the app picks it up.</li>
              <li>Keep robin-midnight-admin-secret.json somewhere safe. Losing it means redeploying.</li>
            </ol>
            <Link href="/admin/midnight/issuers">
              <Button size="sm">Continue to Midnight issuers</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <pre className="whitespace-pre-wrap rounded border bg-white p-3 text-sm">
        {log.join("\n") || "Activity appears here."}
      </pre>
    </main>
  );
}