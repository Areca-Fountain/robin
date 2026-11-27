"use client";

import { useState } from "react";
import type { BrowserWallet } from "@meshsdk/core";
import { useCompany } from "@/components/dashboard/CompanyProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { hasRealWallet } from "@/lib/wallet-status";
import { walletKey } from "@/lib/wallet-key";

/**
 * Shows the company's wallet. The primary or secondary account can connect a Lace
 * wallet, change it to a different one, or disconnect it here.
 * Used in Account Settings.
 */
export default function WalletSetupCard() {
  const { me, authFetch, refresh } = useCompany();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  if (!me) return null;

  const hasWallet = hasRealWallet(me.company.walletAddress);
  const canConnect = me.role !== "team";

  /** Opens Lace and saves its address as the company wallet (first connect or change) */
  async function handleConnect() {
    const changing = hasWallet;
    setBusy(true);
    setError("");
    setNotice("");
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

      if (changing) {
        const sameWallet = walletKey(address) === walletKey(me!.company.walletAddress);
        if (sameWallet) {
          throw new Error(
            "Lace is still on the current company wallet. Switch to the new wallet in Lace first, then press Change wallet again."
          );
        }
        const ok = window.confirm(
          "Replace the company wallet with the wallet currently selected in Lace?\n\n" +
            "New letters will be paid for and signed with the new wallet. Letters already issued can only be revoked with the wallet that issued them."
        );
        if (!ok) return;
      }

      const res = await authFetch("/api/company/wallet", { action: "connect", walletAddress: address });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not connect the wallet.");

      await refresh();
      setNotice(changing ? "Company wallet changed." : "Wallet connected.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect the wallet.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    const ok = window.confirm(
      "Disconnect the company wallet?\n\n" +
        "You will not be able to issue letters until you connect a wallet again. Letters already issued can only be revoked with the wallet that issued them."
    );
    if (!ok) return;

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await authFetch("/api/company/wallet", { action: "disconnect" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not disconnect the wallet.");

      await refresh();
      setNotice("Wallet disconnected.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disconnect the wallet.");
    } finally {
      setBusy(false);
    }
  }

  if (hasWallet) {
    return (
      <div className="space-y-2">
        <p className="text-slate-500">Connected wallet</p>
        <code className="block break-all rounded bg-slate-100 p-2 text-xs text-slate-700">
          {me.company.walletAddress}
        </code>
        <p className="text-xs text-slate-500">
          New letters must be signed with this wallet. Letters already issued can only be revoked
          with the wallet that issued them.
        </p>
        {canConnect && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              onClick={handleConnect}
              disabled={busy}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {busy ? "Working…" : "Change wallet"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={handleDisconnect}
              disabled={busy}
            >
              Disconnect
            </Button>
          </div>
        )}
        {canConnect && (
          <p className="text-xs text-slate-500">
            To change it, switch to the new wallet in Lace first, then press Change wallet.
          </p>
        )}
        {notice && (
          <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {notice}
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

  return (
    <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-center gap-2">
        <p className="font-medium text-amber-900">Connected wallet</p>
        <Badge className="bg-amber-600 text-white">Not connected</Badge>
      </div>
      <p className="text-sm text-amber-900">
        No wallet is connected to this company yet. Connect the Lace wallet (Preprod network)
        that will pay for and sign your letters. You can change or disconnect it later from
        this page.
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
      {notice && (
        <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
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