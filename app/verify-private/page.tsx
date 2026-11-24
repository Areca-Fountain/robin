"use client";

// Verifier page (public, no account). The verifier asks for ONE claim, shares the
// link with the employee, then reads the employee's proof straight from Midnight.

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { hashPosition, toHex } from "@/lib/midnight/credential";
import { readReceipt, type ChainReceipt } from "@/lib/midnight/chain-read";

type Claim = "employment" | "tenure" | "position";

interface VerifyRequest {
  id: string;
  nonce: string;
  claim: Claim;
  min_days: number | null;
  position_hash: string | null;
  status: string;
  expires_at: string;
}

interface IssuerInfo {
  found: boolean;
  companyName?: string | null;
  verified?: boolean;
}

const CLAIM_NUMBER: Record<Claim, number> = { employment: 1, tenure: 2, position: 3 };

function describe(req: VerifyRequest) {
  if (req.claim === "employment") return "Worked at a company (verified employment)";
  if (req.claim === "tenure") return `Worked for at least ${req.min_days} days`;
  return "Held the exact position you typed";
}

export default function PrivateVerifyPage() {
  const [claim, setClaim] = useState<Claim>("employment");
  const [minDays, setMinDays] = useState("365");
  const [position, setPosition] = useState("");
  const [request, setRequest] = useState<VerifyRequest | null>(null);
  const [receipt, setReceipt] = useState<ChainReceipt | null>(null);
  const [issuer, setIssuer] = useState<IssuerInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const stopped = useRef(false);

  const proveLink = request && typeof window !== "undefined" ? `${window.location.origin}/prove/${request.id}` : "";

  // Reopen an existing request from /verify-private?id=...
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) return;
    fetch(`/api/midnight/verify-requests?id=${encodeURIComponent(id)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? "Request not found.");
        setRequest(j.request as VerifyRequest);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const check = useCallback(async (req: VerifyRequest) => {
    setChecking(true);
    try {
      const r = await readReceipt(req.nonce);
      if (!r) return false;
      setReceipt(r);
      const res = await fetch(`/api/midnight/issuers-info?issuerId=${r.issuerId}`);
      setIssuer((await res.json().catch(() => ({ found: false }))) as IssuerInfo);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setChecking(false);
    }
  }, []);

  // Look for the employee's proof every few seconds.
  useEffect(() => {
    if (!request || receipt) return;
    stopped.current = false;
    const timer = setInterval(async () => {
      if (stopped.current) return;
      if (await check(request)) clearInterval(timer);
    }, 8000);
    return () => {
      stopped.current = true;
      clearInterval(timer);
    };
  }, [request, receipt, check]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setReceipt(null);
    setIssuer(null);
    try {
      const body: Record<string, unknown> = { claim };
      if (claim === "tenure") body.minDays = Number(minDays);
      if (claim === "position") {
        if (!position.trim()) throw new Error("Type the position you want to check.");
        body.positionHash = toHex(await hashPosition(position));
      }
      const res = await fetch("/api/midnight/verify-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not create the request.");
      setRequest(json.request as VerifyRequest);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(proveLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  // The proof must answer exactly what was asked.
  const answersRequest =
    request && receipt
      ? receipt.claim === CLAIM_NUMBER[request.claim] &&
        (request.claim !== "tenure" || receipt.minDays >= (request.min_days ?? 0)) &&
        (request.claim !== "position" ||
          receipt.positionHash === (request.position_hash ?? "").toLowerCase())
      : false;

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <div className="mx-auto w-full max-w-2xl space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Private verification</h1>
          <p className="mt-1 text-sm text-slate-600">
            Ask an employee to prove one fact about their service letter. You see only the answer,
            never their name, NIC or letter.
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        )}

        {!request && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">1. What do you want to verify?</CardTitle>
              <CardDescription>Pick one claim.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  {(
                    [
                      ["employment", "Worked at a company"],
                      ["tenure", "Worked for at least N days"],
                      ["position", "Held a specific position"],
                    ] as const
                  ).map(([value, label]) => (
                    <label key={value} className="flex items-center gap-2 text-sm text-slate-800">
                      <input
                        type="radio"
                        name="claim"
                        checked={claim === value}
                        onChange={() => setClaim(value)}
                      />
                      {label}
                    </label>
                  ))}
                </div>

                {claim === "tenure" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="minDays">Minimum days worked</Label>
                    <Input
                      id="minDays"
                      type="number"
                      min={1}
                      max={20000}
                      value={minDays}
                      onChange={(e) => setMinDays(e.target.value)}
                    />
                  </div>
                )}
                {claim === "position" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="position">Position</Label>
                    <Input
                      id="position"
                      value={position}
                      onChange={(e) => setPosition(e.target.value)}
                      placeholder="e.g. Production Supervisor"
                    />
                  </div>
                )}

                <Button type="submit" disabled={busy}>
                  {busy ? "Creating..." : "Create request"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {request && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">2. Send this link to the employee</CardTitle>
              <CardDescription>
                Claim: <strong>{describe(request)}</strong>. The link works once and expires in 24 hours.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="break-all rounded-md bg-slate-100 px-3 py-2 font-mono text-xs text-slate-700">
                {proveLink}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void copyLink()}>
                  {copied ? "Copied" : "Copy link"}
                </Button>
                <Button variant="outline" disabled={checking} onClick={() => void check(request)}>
                  {checking ? "Checking..." : "Check now"}
                </Button>
              </div>
              {!receipt && (
                <p className="text-sm text-slate-500">
                  Waiting for the employee&apos;s proof. This page checks Midnight every few seconds.
                  Bookmark <span className="font-mono">/verify-private?id={request.id}</span> to come back later.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {request && receipt && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-lg">3. Result</CardTitle>
                {answersRequest && issuer?.found ? (
                  <Badge className="bg-emerald-600 text-white">Proof valid</Badge>
                ) : (
                  <Badge className="bg-red-600 text-white">Not confirmed</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-800">
              {answersRequest ? (
                <p>
                  <strong>Confirmed:</strong> {describe(request)}.
                </p>
              ) : (
                <p className="text-red-700">The proof found does not match what you asked for.</p>
              )}
              {issuer?.found ? (
                <p>
                  Issued by <strong>{issuer.companyName ?? "a registered company"}</strong>{" "}
                  <Badge
                    className={issuer.verified ? "bg-emerald-600 text-white" : "bg-slate-500 text-white"}
                  >
                    {issuer.verified ? "Robin verified" : "Not verified by Robin"}
                  </Badge>
                </p>
              ) : (
                <p className="text-red-700">The issuing company is not known to Robin.</p>
              )}
              <p className="text-xs text-slate-500">
                The contract confirmed the letter exists, was not revoked, and came from a company
                registered by Robin. No personal data was shared.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}