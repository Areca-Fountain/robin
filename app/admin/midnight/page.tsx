'use client';

import { useState } from 'react';
import {
  MIDNIGHT_CONTRACT_ADDRESS,
  MIDNIGHT_ENABLED,
  MIDNIGHT_NETWORK_ID,
} from '@/lib/midnight/config';
import {
  connectLaceMidnight,
  type ConnectedMidnightWallet,
} from '@/lib/midnight/lace-connector';
import { callRegisterIssuer } from '@/lib/midnight/contract-api';

interface IssuerRecord {
  company_id: string;
  issuer_id: string;
  midnight_address: string | null;
  registered_tx: string | null;
  status: 'pending' | 'registered' | 'removed';
  updated_at: string;
}

export default function AdminMidnightPage() {
  const [wallet, setWallet] = useState<ConnectedMidnightWallet | null>(null);
  const [companyId, setCompanyId] = useState('');
  const [issuerRecord, setIssuerRecord] = useState<IssuerRecord | null>(null);
  const [manualIssuerId, setManualIssuerId] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleConnectWallet() {
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const connected = await connectLaceMidnight(MIDNIGHT_NETWORK_ID);
      setWallet(connected);
      setStatusMsg(`Connected ${connected.walletName} (${MIDNIGHT_NETWORK_ID})`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to connect Lace Midnight');
    }
  }

  async function handleLookupCompany(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    setIssuerRecord(null);

    if (!companyId.trim()) {
      setErrorMsg('Enter a Company ID to look up.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `/api/midnight/issuers?companyId=${encodeURIComponent(companyId.trim())}`
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to fetch issuer record');
      }
      if (!json.issuer) {
        setStatusMsg('No Midnight enrollment found in mn_issuers for this company yet.');
      } else {
        setIssuerRecord(json.issuer);
        setManualIssuerId(json.issuer.issuer_id || '');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterOnChain() {
    setErrorMsg(null);
    setStatusMsg(null);

    if (!wallet) {
      setErrorMsg('Connect your admin Lace Midnight wallet first.');
      return;
    }

    const targetIssuerId = (issuerRecord?.issuer_id || manualIssuerId).trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(targetIssuerId)) {
      setErrorMsg('Issuer ID must be a valid 64-character hex string.');
      return;
    }

    setLoading(true);
    try {
      setStatusMsg('Building ZK proof via localhost:6300 and awaiting Lace approval...');
      const txId = await callRegisterIssuer(wallet, targetIssuerId);

      if (companyId.trim()) {
        const res = await fetch('/api/midnight/issuers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'confirm_onchain',
            companyId: companyId.trim(),
            registeredTx: txId,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || 'On-chain tx succeeded, but DB update failed');
        }
        setIssuerRecord(json.issuer);
      }

      setStatusMsg(`Issuer registered on Midnight! Tx ID: ${txId}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'On-chain registration failed');
    } finally {
      setLoading(false);
    }
  }

  if (!MIDNIGHT_ENABLED) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-xl font-semibold">Midnight Issuer Admin</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Midnight integration is disabled. Set <code>NEXT_PUBLIC_MIDNIGHT_ENABLED=true</code> in{' '}
          <code>.env.local</code> and restart the dev server.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Midnight Issuer Registry (Admin)</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Register verified companies on the <code>robin_private</code> Midnight contract.
        </p>
        <p className="mt-1 font-mono text-xs text-neutral-500">
          Contract: {MIDNIGHT_CONTRACT_ADDRESS || 'Not configured (NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS)'}
        </p>
      </div>

      <section className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium">1. Admin Midnight Wallet</h2>
            <p className="text-xs text-neutral-500">
              Must be the deployer/admin wallet for the contract on {MIDNIGHT_NETWORK_ID}.
            </p>
          </div>
          <button
            type="button"
            onClick={handleConnectWallet}
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            {wallet ? 'Reconnect Lace' : 'Connect Lace Midnight'}
          </button>
        </div>

        {wallet && (
          <div className="rounded bg-neutral-50 p-3 font-mono text-xs space-y-1 break-all">
            <div>Shielded: {wallet.shieldedAddress}</div>
            <div>Unshielded: {wallet.unshieldedAddress}</div>
          </div>
        )}
      </section>

      <section className="rounded-lg border p-4 space-y-4">
        <h2 className="font-medium">2. Look Up & Register Issuer</h2>

        <form onSubmit={handleLookupCompany} className="flex gap-2">
          <input
            type="text"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            placeholder="Company ID (from company_applications)"
            className="flex-1 rounded-md border px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
          >
            Lookup
          </button>
        </form>

        {issuerRecord && (
          <div className="rounded bg-neutral-50 p-3 text-xs space-y-1 break-all">
            <div>
              <strong>Status:</strong> {issuerRecord.status}
            </div>
            <div>
              <strong>Issuer ID:</strong> <code>{issuerRecord.issuer_id}</code>
            </div>
            {issuerRecord.registered_tx && (
              <div>
                <strong>Registered Tx:</strong> <code>{issuerRecord.registered_tx}</code>
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-xs font-medium text-neutral-700">
            Issuer ID (64-char hex)
          </label>
          <input
            type="text"
            value={manualIssuerId}
            onChange={(e) => setManualIssuerId(e.target.value)}
            placeholder="64-character hex issuerId"
            className="w-full rounded-md border px-3 py-2 font-mono text-xs"
          />
        </div>

        <button
          type="button"
          onClick={handleRegisterOnChain}
          disabled={loading || !wallet}
          className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {loading ? 'Processing...' : 'Register Issuer On-Chain (registerIssuer)'}
        </button>
      </section>

      {statusMsg && (
        <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800 break-all">
          {statusMsg}
        </div>
      )}

      {errorMsg && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 break-all">
          {errorMsg}
        </div>
      )}
    </main>
  );
}
