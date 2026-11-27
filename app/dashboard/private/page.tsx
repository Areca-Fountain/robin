"use client";

import { useCallback, useEffect, useState } from "react";
import { useCompany } from "@/components/dashboard/CompanyProvider";
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
import { connectLaceMidnight } from "@/lib/midnight/lace-connector";
import { MIDNIGHT_CONTRACT_ADDRESS, MIDNIGHT_NETWORK_ID } from "@/lib/midnight/config";
import {
  buildAttributes,
  isHex32,
  randomSalt,
  serializeCredential,
  toHex,
  todayString,
  type CredentialPackage,
} from "@/lib/midnight/credential";
import {
  commitmentOf,
  createIssuerSecret,
  downloadText,
  getIssuerSecret,
  issuerIdOf,
  parseIssuerBackup,
  saveIssuerSecret,
} from "@/lib/midnight/company-issuer";

interface IssuerRow {
  company_id: string;
  issuer_id: string;
  status: "pending" | "registered" | "removed";
  registered_tx: string | null;
}

interface PrivateLetter {
  id: string;
  commitment: string;
  midnight_tx: string | null;
  issued_at: string;
  revoked: boolean;
  revoked_at: string | null;
  note: string | null;
}

function errText(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const cause = (e as Error & { cause?: unknown }).cause;
  return cause instanceof Error ? `${e.message} (${cause.message})` : e.message;
}

export default function PrivateLettersPage() {
  const { me, authFetch } = useCompany();

  const [secret, setSecret] = useState<string | null>(null);
  const [issuerId, setIssuerId] = useState("");
  const [dbIssuer, setDbIssuer] = useState<IssuerRow | null>(null);
  const [letters, setLetters] = useState<PrivateLetter[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // issue form
  const [employeeName, setEmployeeName] = useState("");
  const [nic, setNic] = useState("");
  const [position, setPosition] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");

  const companyId = me?.company.id ?? "";
  const isOwner = me?.role !== "team";

  const loadStatus = useCallback(async () => {
    const res = await authFetch("/api/midnight/issuers", { action: "status" });
    const json = await res.json().catch(() => ({}));
    if (res.ok) setDbIssuer((json.issuer as IssuerRow) ?? null);
  }, [authFetch]);

  const loadLetters = useCallback(async () => {
    const res = await authFetch("/api/midnight/letters", { action: "list" });
    const json = await res.json().catch(() => ({}));
    if (res.ok) setLetters(json.letters as PrivateLetter[]);
  }, [authFetch]);

  // Load this browser's key, then the saved status and letters.
  useEffect(() => {
    if (!companyId) return;
    const s = getIssuerSecret(companyId);
    setSecret(s);
    if (s) {
      issuerIdOf(s)
        .then(setIssuerId)
        .catch((e) => setError(errText(e)));
    }
    void loadStatus();
    void loadLetters();
  }, [companyId, loadStatus, loadLetters]);

  if (!me) return null;

  const keyMatches = Boolean(dbIssuer && issuerId && dbIssuer.issuer_id === issuerId);
  const registered = dbIssuer?.status === "registered" && keyMatches;

  async function applySecret(hex: string) {
    saveIssuerSecret(companyId, hex);
    setSecret(hex);
    setIssuerId(await issuerIdOf(hex));
  }

  async function handleCreateKey() {
    setError("");
    setNotice("");
    try {
      const hex = createIssuerSecret();
      await applySecret(hex);
      const id = await issuerIdOf(hex);
      downloadText(
        `robin-issuer-key-${me!.company.name.replace(/\W+/g, "-")}.json`,
        JSON.stringify({ issuerSecret: hex, issuerId: id }, null, 2)
      );
      setNotice("Key created. A backup file was downloaded. Keep it safe: it cannot be recovered.");
    } catch (e) {
      setError(errText(e));
    }
  }

  async function handleImportKey(file: File | undefined) {
    if (!file) return;
    setError("");
    setNotice("");
    try {
      await applySecret(parseIssuerBackup(await file.text()));
      setNotice("Key imported into this browser.");
    } catch (e) {
      setError(errText(e));
    }
  }

  function handleDownloadBackup() {
    if (!secret) return;
    downloadText(
      `robin-issuer-key-${me!.company.name.replace(/\W+/g, "-")}.json`,
      JSON.stringify({ issuerSecret: secret, issuerId }, null, 2)
    );
  }

  async function handleEnroll() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await authFetch("/api/midnight/issuers", { action: "enroll", issuerId });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not submit the key.");
      setDbIssuer(json.issuer as IssuerRow);
      setNotice("Sent to Robin. An admin will register your company on Midnight.");
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleIssue(e: React.FormEvent) {
    e.preventDefault();
    if (!secret) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!MIDNIGHT_CONTRACT_ADDRESS) throw new Error("NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS is not set.");

      // 0. Plan limit, checked BEFORE anything is sent to the chain.
      const q = await authFetch("/api/midnight/letters", { action: "check_quota" });
      const quota = await q.json().catch(() => ({}));
      if (q.ok && quota.allowed === false) {
        throw new Error(
          "Free plan limit reached (5 service letters in total). Upgrade to Premium for unlimited letters."
        );
      }

      // 1. Build the private attributes and the commitment (all in this browser).
      const built = await buildAttributes({
        employeeName,
        nic,
        position,
        startDate,
        endDate: endDate || undefined,
      });
      const saltHex = toHex(randomSalt());
      const localCommitment = await commitmentOf(built.chain, saltHex);

      // 2. Put ONLY the commitment on Midnight.
      const wallet = await connectLaceMidnight();
      setNotice("Approve in your wallet. Proving can take a minute...");
      const { callIssueLetter } = await import("@/lib/midnight/contract-api");
      const result = await callIssueLetter(wallet, secret, built.chain, saltHex);
      const commitment = isHex32(result.commitmentHex) ? result.commitmentHex : localCommitment;

      // 3. Give the employee their private credential file. Do this FIRST so it is never lost.
      const letterId = crypto.randomUUID();
      const pkg: CredentialPackage = {
        v: 1,
        letterId,
        commitment,
        contractAddress: MIDNIGHT_CONTRACT_ADDRESS,
        network: MIDNIGHT_NETWORK_ID,
        companyName: me!.company.name,
        issuedAt: new Date().toISOString(),
        salt: saltHex,
        attributes: built.json,
        display: {
          employeeName: employeeName.trim(),
          position: position.trim(),
          startDate,
          endDate: built.endDate,
        },
      };
      downloadText(
        `robin-credential-${employeeName.trim().replace(/\W+/g, "-")}-${letterId.slice(0, 8)}.json`,
        serializeCredential(pkg)
      );

      // 4. Save the public record (no personal data) for the company's list.
      const save = await authFetch("/api/midnight/letters", {
        action: "record",
        letterId,
        commitment,
        midnightTx: result.txId,
        note,
      });
      const saved = await save.json().catch(() => ({}));
      if (!save.ok) {
        setError(
          `The letter IS on Midnight and the credential file was downloaded, but Robin could not save it to your list: ${saved.error ?? save.status}`
        );
      } else {
        setNotice(
          "Letter issued on Midnight. The credential file was downloaded: send it to the employee. Robin does not keep a copy."
        );
        setEmployeeName("");
        setNic("");
        setPosition("");
        setStartDate("");
        setEndDate("");
        setNote("");
      }
      await loadLetters();
    } catch (err) {
      setError(errText(err));
      console.error(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(letter: PrivateLetter) {
    if (!secret) return;
    if (!window.confirm("Revoke this letter? This is permanent and public.")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const wallet = await connectLaceMidnight();
      setNotice("Approve in your wallet. Proving can take a minute...");
      const { callRevokeLetter } = await import("@/lib/midnight/contract-api");
      await callRevokeLetter(wallet, secret, letter.commitment);

      const res = await authFetch("/api/midnight/letters", { action: "revoked", letterId: letter.id });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`Revoked on Midnight, but the list was not updated: ${json.error ?? res.status}`);
      setNotice("Letter revoked on Midnight.");
      await loadLetters();
    } catch (err) {
      setError(errText(err));
      console.error(err);
    } finally {
      setBusy(false);
    }
  }

  const statusBadge = !dbIssuer ? (
    <Badge className="bg-slate-500 text-white">Not submitted</Badge>
  ) : dbIssuer.status === "registered" ? (
    <Badge className="bg-emerald-600 text-white">Registered on Midnight</Badge>
  ) : (
    <Badge className="bg-amber-500 text-white">Waiting for Robin admin</Badge>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Private Letters (Midnight)</h1>
        <p className="mt-1 text-slate-600">
          The employee&apos;s details never go on the blockchain or to Robin. Only a fingerprint is
          recorded. The employee receives a private credential file and proves what they choose to.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
          {notice}
        </p>
      )}

      {/* 1. issuer key */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-lg">1. Company issuer key</CardTitle>
            {statusBadge}
          </div>
          <CardDescription>
            A secret key kept only in this browser. Robin only sees its hash. Back it up: if it is lost,
            the company cannot issue or revoke letters.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!secret ? (
            <div className="space-y-3">
              {isOwner && (
                <Button onClick={handleCreateKey} disabled={busy}>
                  Create issuer key
                </Button>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="importKey">Or import an existing backup file</Label>
                <Input
                  id="importKey"
                  type="file"
                  accept="application/json"
                  onChange={(e) => void handleImportKey(e.target.files?.[0])}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="break-all text-xs text-slate-600">
                Issuer id: <span className="font-mono">{issuerId || "…"}</span>
              </p>
              {dbIssuer && !keyMatches && (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  The key in this browser is not the one submitted to Robin. Import the correct backup file.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={handleDownloadBackup}>
                  Download backup
                </Button>
                {isOwner && (!dbIssuer || !keyMatches) && (
                  <Button onClick={handleEnroll} disabled={busy || !issuerId}>
                    Submit to Robin for registration
                  </Button>
                )}
              </div>
              {dbIssuer?.status === "pending" && keyMatches && (
                <p className="text-sm text-slate-600">
                  Submitted. Robin&apos;s admin must register this key on Midnight before you can issue letters.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. issue */}
      <form onSubmit={handleIssue}>
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">2. Issue a private letter</CardTitle>
            <CardDescription>
              {registered
                ? "Fill in the details. They are hashed in your browser and never stored by Robin."
                : "Available once your company is registered on Midnight."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pn">Employee name</Label>
                <Input id="pn" value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} required disabled={!registered || busy} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pnic">NIC</Label>
                <Input id="pnic" value={nic} onChange={(e) => setNic(e.target.value)} required disabled={!registered || busy} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ppos">Position</Label>
                <Input id="ppos" value={position} onChange={(e) => setPosition(e.target.value)} required disabled={!registered || busy} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pnote">Internal reference (optional, no personal data)</Label>
                <Input id="pnote" value={note} maxLength={60} onChange={(e) => setNote(e.target.value)} disabled={!registered || busy} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pstart">Start date</Label>
                <Input id="pstart" type="date" max={todayString()} value={startDate} onChange={(e) => setStartDate(e.target.value)} required disabled={!registered || busy} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pend">End date (leave empty for a current employee)</Label>
                <Input id="pend" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={!registered || busy} />
              </div>
            </div>
            <Button type="submit" disabled={!registered || busy} className="w-full">
              {busy ? "Working… approve in your wallet" : "Issue private letter"}
            </Button>
          </CardContent>
        </Card>
      </form>

      {/* 3. list */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">3. Issued private letters</CardTitle>
          <CardDescription>Only the public fingerprint and dates are listed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {letters.length === 0 && <p className="text-sm text-slate-500">No private letters yet.</p>}
          {letters.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
              <div className="min-w-0 text-sm">
                <p className="font-medium text-slate-900">
                  {l.note || "Letter"}{" "}
                  <span className="font-mono text-xs text-slate-500">{l.commitment.slice(0, 12)}…</span>
                </p>
                <p className="text-xs text-slate-500">
                  Issued {new Date(l.issued_at).toLocaleDateString()}
                  {l.revoked && l.revoked_at ? ` · revoked ${new Date(l.revoked_at).toLocaleDateString()}` : ""}
                </p>
              </div>
              {l.revoked ? (
                <Badge className="bg-red-600 text-white">Revoked</Badge>
              ) : (
                <Button size="sm" variant="outline" disabled={busy || !secret || !keyMatches} onClick={() => void handleRevoke(l)}>
                  Revoke
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}