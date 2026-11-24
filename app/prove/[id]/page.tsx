"use client";

// Employee page. Opened from the verifier's link. The employee loads their own
// credential file; the proof is made in the browser and only the answer goes on-chain.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { connectLaceMidnight } from "@/lib/midnight/lace-connector";
import { MIDNIGHT_CONTRACT_ADDRESS } from "@/lib/midnight/config";
import { parseCredential, type CredentialPackage } from "@/lib/midnight/credential";

interface VerifyRequest {
  id: string;
  nonce: string;
  claim: "employment" | "tenure" | "position";
  min_days: number | null;
  position_hash: string | null;
  expires_at: string;
}

function errText(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const cause = (e as Error & { cause?: unknown }).cause;
  return cause instanceof Error ? `${e.message} (${cause.message})` : e.message;
}

function describe(req: VerifyRequest) {
  if (req.claim === "employment") return "that you worked at this company";
  if (req.claim === "tenure") return `that you worked for at least ${req.min_days} days`;
  return "that you held the position the verifier named";
}

export default function ProvePage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [request, setRequest] = useState<VerifyRequest | null>(null);
  const [credential, setCredential] = useState<CredentialPackage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [txId, setTxId] = useState("");

  useEffect(() => {
    if (!id) return;
    fetch(`/api/midnight/verify-requests?id=${encodeURIComponent(id)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? "Request not found.");
        setRequest(j.request as VerifyRequest);
      })
      .catch((e) => setError(errText(e)));
  }, [id]);

  async function handleFile(file?: File) {
    setError("");
    setCredential(null);
    if (!file || !request) return;
    try {
      const cred = parseCredential(await file.text());
      if (
        MIDNIGHT_CONTRACT_ADDRESS &&
        cred.contractAddress.toLowerCase() !== MIDNIGHT_CONTRACT_ADDRESS.toLowerCase()
      ) {
        throw new Error("This credential belongs to a different Robin contract.");
      }
      // Check the claim locally first, so a wallet approval is never wasted.
      if (request.claim === "position" && cred.attributes.positionHash !== request.position_hash) {
        throw new Error("Your letter's position does not match the position the verifier asked about.");
      }
      if (request.claim === "tenure") {
        const days = cred.attributes.endDay - cred.attributes.startDay;
        if (days < (request.min_days ?? 0)) {
          throw new Error(`Your letter shows ${days} days, which is less than the ${request.min_days} requested.`);
        }
      }
      setCredential(cred);
    } catch (e) {
      setError(errText(e));
    }
  }

  async function handleProve() {
    if (!request || !credential) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const wallet = await connectLaceMidnight();
      setNotice("Approve in your wallet. Proving can take a minute...");
      const { callProveClaim } = await import("@/lib/midnight/contract-api");
      const claim =
        request.claim === "employment"
          ? ({ type: "employment" } as const)
          : request.claim === "tenure"
            ? ({ type: "tenure", minDays: request.min_days ?? 0 } as const)
            : ({ type: "position", positionHashHex: request.position_hash ?? "" } as const);
      const tx = await callProveClaim(wallet, credential, request.nonce, claim);
      setTxId(tx);
      setNotice("Done. The verifier can now see your proof. You can close this page.");
    } catch (e) {
      setError(errText(e));
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <div className="mx-auto w-full max-w-xl space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Prove from your service letter</h1>
          <p className="mt-1 text-sm text-slate-600">
            Your file never leaves this browser. Only the answer to the question below is published.
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {notice}
          </p>
        )}

        {request && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">The verifier wants to confirm</CardTitle>
              <CardDescription>{describe(request)}.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="cred">Your credential file (robin-credential-….json)</Label>
                <Input
                  id="cred"
                  type="file"
                  accept="application/json"
                  onChange={(e) => void handleFile(e.target.files?.[0])}
                />
              </div>

              {credential && (
                <div className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">
                  <p>
                    Letter from <strong>{credential.companyName}</strong> for{" "}
                    <strong>{credential.display.employeeName}</strong>
                  </p>
                  <p className="text-xs text-slate-500">
                    This detail is shown only to you. It is not sent to the verifier.
                  </p>
                </div>
              )}

              <Button onClick={() => void handleProve()} disabled={!credential || busy || Boolean(txId)}>
                {busy ? "Working..." : "Prove and publish"}
              </Button>

              {txId && <p className="break-all text-xs text-slate-500">Transaction: {txId}</p>}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}