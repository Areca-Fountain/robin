'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { connectLaceMidnight } from '@/lib/midnight/lace-connector';
import { randomBytes32 } from '../../../midnight/witnesses';
import { toHex } from '@/lib/midnight/credential';

export default function MidnightDeployPage() {
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [address, setAddress] = useState('');
  const [secretHex, setSecretHex] = useState('');

  const add = (m: string) => setLog((l) => [...l, m]);

  async function deploy() {
    setBusy(true);
    setLog([]);
    try {
      add('Connecting to Lace (Midnight Preprod)...');
      const wallet = await connectLaceMidnight();
      add(`Node: ${wallet.uris.substrateNodeUri.replace(/project_id=[^&]+/, 'project_id=***')}`);
      

      const secret = randomBytes32();
      const hex = toHex(secret);
      setSecretHex(hex);

      add('Deploying contract (approve in Lace, proving may take a minute)...');
      // Loaded only in the browser, on click, so the server never imports it.
      const { deployRobinPrivate } = await import('@/lib/midnight/contract-api');
      const res = await deployRobinPrivate(wallet, secret);
      setAddress(res.contractAddress);
      add(`Deployed. tx: ${res.txId}`);
    } catch (e) {
      add(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
      const cause = e instanceof Error ? (e as Error & { cause?: unknown }).cause : undefined;
      if (cause) {
        add(`CAUSE: ${cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)}`);
      }
      console.error(e, cause);
    } finally {
      setBusy(false);
    }
  }

  function downloadSecret() {
    const blob = new Blob(
      [JSON.stringify({ adminSecret: secretHex, contractAddress: address }, null, 2)],
      { type: 'application/json' }
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'robin-midnight-admin-secret.json';
    a.click();
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-8">
      <h1 className="text-2xl font-semibold">Deploy Robin Private (Midnight Preprod)</h1>
      <Button onClick={deploy} disabled={busy}>
        {busy ? 'Working...' : 'Deploy contract'}
      </Button>

      <pre className="whitespace-pre-wrap rounded border p-3 text-sm">
        {log.join('\n') || 'Logs appear here.'}
      </pre>

      {address && (
        <div className="space-y-2">
          <p className="break-all text-sm">
            Add to .env.local:
            <br />
            <code>NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS={address}</code>
          </p>
          <Button onClick={downloadSecret}>Download admin secret (keep it safe)</Button>
        </div>
      )}
    </main>
  );
}