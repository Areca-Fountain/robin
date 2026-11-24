"use client";

import React, { useState } from "react";
import { useCompany } from "@/components/dashboard/CompanyProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { walletKey } from "@/lib/wallet-key";
import { PrivateLettersPromo } from "@/components/dashboard/PrivateLettersCard";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function RevokeLetterPage() {
  const { me } = useCompany();
  const [letterRef, setLetterRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revokedTx, setRevokedTx] = useState("");

  async function handleRevoke(e: React.FormEvent) {
    e.preventDefault();
    if (!me) return;
    setError("");
    setRevokedTx("");

    // Accept the letter id or the full verification link
    const letterId = letterRef.trim().replace(/\/+$/, "").split("/").pop() ?? "";
    if (!UUID_REGEX.test(letterId)) {
      setError("Paste the letter id or its verification link.");
      return;
    }

    setBusy(true);
    try {
      // 1. Find the letter's registry UTxO
      const res = await fetch(`/api/letters/utxo?letterId=${letterId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not find this letter.");
      if (data.spent) throw new Error("This letter has already been revoked.");

      // 2. Connect the company wallet
      const mesh = await import("@meshsdk/core");
      let wallet;
      try {
        wallet = await mesh.BrowserWallet.enable("lace");
      } catch {
        throw new Error("Could not open Lace. Unlock the extension, refresh and try again.");
      }
      if ((await wallet.getNetworkId()) !== 0) {
        throw new Error("Lace is on mainnet. Switch it to the Preprod test network.");
      }
      const address = await wallet.getChangeAddress();
      const connected = walletKey(address);
      const registered = walletKey(me.company.walletAddress);
      if (!connected || !registered || connected !== registered) {
        throw new Error("This is not your company's registered wallet. Switch wallets in Lace.");
      }

      // 3. Build, sign and send the revoke transaction
      //    (the contract rejects it unless the issuer's key signs)
      const { revokeLetterOnChain } = await import("@/lib/letter-tx");
      const txHash = await revokeLetterOnChain(wallet, {
        txHash: data.txHash,
        outputIndex: data.outputIndex,
        amount: data.amount,
      });
      setRevokedTx(txHash);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/declin|reject|cancel|denied/i.test(message)) {
        setError("You cancelled the request in Lace. Nothing was sent.");
      } else {
        setError(message);
      }
      console.error(err);
    } finally {
      setBusy(false);
    }
  }

  if (!me) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Revoke Service Letter</h1>
        <p className="mt-1 text-slate-600">
          Revoking spends the letter&apos;s record in the Robin contract. After it confirms,
          anyone who scans the letter will see it as revoked. This cannot be undone.
        </p>
      </div>
      <PrivateLettersPromo variant="revoke" />
      <form onSubmit={handleRevoke}>
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Letter to revoke</CardTitle>
            <CardDescription>
              Paste the letter id or its verification link. Only your company&apos;s wallet can revoke.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="letterRef">Letter id or link</Label>
              <Input
                id="letterRef"
                value={letterRef}
                onChange={(e) => setLetterRef(e.target.value)}
                disabled={busy}
                required
              />
            </div>

            {error && (
              <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
                {error}
              </p>
            )}

            {revokedTx && (
              <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                Revoke transaction sent. It shows as revoked once Cardano confirms it (about a minute).{" "}
                <a
                  href={`https://preprod.cardanoscan.io/transaction/${revokedTx}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all underline"
                >
                  {revokedTx}
                </a>
              </p>
            )}

            <Button type="submit" disabled={busy} className="w-full bg-red-600 hover:bg-red-700">
              {busy ? "Working… approve in Lace" : "Revoke letter"}
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}