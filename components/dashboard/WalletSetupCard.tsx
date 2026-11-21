"use client";

import { useState } from "react";
import type { BrowserWallet } from "@meshsdk/core";
import { useCompany } from "@/components/dashboard/CompanyProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { hasRealWallet } from "@/lib/wallet-status";

/**
 * Shows the company's wallet. When none is connected yet (companies created by a
 * registrar), the primary or secondary account can connect their Lace wallet here.
 * Used in Account Settings.
 */
export default function WalletSetupCard() {
  const { me, authFetch, refresh } = useCompany();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!me) return null;

  const hasWallet = hasRealWallet(me.company.walletAddress);
  const canConnect = me.role !== "team";

  async function handleConnect() {
    setBusy(true);
    setError("");
    try {
      const mesh = await import("@meshsdk/core");

      let wallet: BrowserWallet;
      try {
        wallet = await mesh.BrowserWallet.enable("lace");
      } catch {
        throw new Error(
          "Could not open Lace. Install the Lace extension, unlock it, refresh this page and try again."
        );
      }

      if ((await wallet.getNetworkId()) !== 0) {
        throw new Error(
          "Lace is on the Cardano mainnet. Switch Lace to the Preprod test network and connect again."
        );
      }

      const address = await wallet.getChangeAddress();
      const res = await authFetch("/api/company/wallet", { walletAddress: address });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not connect the wallet.");

      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect the wallet.");
    } finally {
      setBusy(false);
    }
  }

  if (hasWallet) {
    return (
      <div>
        <p className="text-slate-500">Connected wallet</p>
        <code className="block break-all rounded bg-slate-100 p-2 text-xs text-slate-700">
          {me.company.walletAddress}
        </code>
        <p className="mt-1 text-xs text-slate-500">
          Letters must be signed with this wallet. To change it, contact Robin&apos;s team.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-center gap-2">
        <p className="font-medium text-amber-900">Connected wallet</p>
        <Badge className="bg-amber-600 text-white">Not connected</Badge>
      </div>
      <p className="text-sm text-amber-900">
        No wallet is connected to this company yet. Connect the Lace wallet (Preprod network)
        that will pay for and sign your letters. After it is saved, it can only be changed by
        Robin&apos;s team.
      </p>
      {canConnect ? (
        <Button
          type="button"
          onClick={handleConnect}
          disabled={busy}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          {busy ? "Connecting…" : "Connect Lace wallet"}
        </Button>
      ) : (
        <p className="text-sm text-amber-900">
          Ask the company&apos;s primary account to connect the wallet.
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}