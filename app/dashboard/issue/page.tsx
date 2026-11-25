"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { BrowserWallet } from "@meshsdk/core";
import { useCompany } from "@/components/dashboard/CompanyProvider";
import { BulkIssueSection } from "@/components/dashboard/BulkIssueSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { sha256Hex } from "@/lib/hash";
import { generateLetterPdf } from "@/lib/letter-pdf";
import { formatDateOnly, renderTemplate, todayIso } from "@/lib/letter-format";
import { walletKey } from "@/lib/wallet-key";
import { fetchLetterheadBytes } from "@/lib/documents-client";
import { PrivateLettersPromo } from "@/components/dashboard/PrivateLettersCard";

const POLL_INTERVAL_MS = 5000;
const POLL_MAX_TRIES = 36;

interface Format {
  id: string;
  name: string;
  body: string;
  signerName: string;
  signerTitle: string;
  status: "Draft" | "Generated";
}

interface PendingRecord {
  letterId: string;
  letterHash: string;
  txHash: string;
  employeeName: string;
  position: string;
  formatId: string;
  workStatus: "active" | "resigned";
  fileName: string;
  blobUrl: string;
  verifyUrl: string;
}

interface IssuedLetter {
  letterId: string;
  txHash: string;
  letterHash: string;
  employeeName: string;
  fileName: string;
  blobUrl: string;
  verifyUrl: string;
}

type Step = "idle" | "pdf" | "sign" | "submit" | "confirm" | "done" | "timeout";
type IssueMode = "single" | "bulk";

const STEP_LABELS = [
  { key: "pdf", label: "Creating the PDF" },
  { key: "sign", label: "Approve in Lace" },
  { key: "submit", label: "Sending to Cardano" },
  { key: "confirm", label: "Waiting for confirmation" },
];

function slug(text: string): string {
  return (
    text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) ||
    "employee"
  );
}

export default function IssueLetterPage() {
  const { me, authFetch, refresh } = useCompany();
  const walletRef = useRef<BrowserWallet | null>(null);

  const [mode, setMode] = useState<IssueMode>("single");

  const [formats, setFormats] = useState<Format[]>([]);
  const [formatsLoading, setFormatsLoading] = useState(true);
  const [formatId, setFormatId] = useState("");
  const [selectedLetterheadId, setSelectedLetterheadId] = useState<string>("");

  const [connecting, setConnecting] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [connectError, setConnectError] = useState("");

  const [employeeName, setEmployeeName] = useState("");
  const [nic, setNic] = useState("");
  const [position, setPosition] = useState("");
  const [startDate, setStartDate] = useState("");
  const [stillEmployed, setStillEmployed] = useState(false);
  const [endDate, setEndDate] = useState("");

  const [step, setStep] = useState<Step>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [pendingRecord, setPendingRecord] = useState<PendingRecord | null>(null);
  const [issued, setIssued] = useState<IssuedLetter | null>(null);

  const busy = step === "pdf" || step === "sign" || step === "submit" || step === "confirm";

  useEffect(() => {
    let active = true;
    async function initialLoad() {
      try {
        const res = await authFetch("/api/formats", { action: "list" });
        const data = await res.json();
        if (!active) return;
        if (!res.ok) throw new Error(data.error ?? "Could not load formats.");
        const ready = (data.formats as Format[]).filter((f) => f.status === "Generated");
        setFormats(ready);
        setFormatId((current) => current || ready[0]?.id || "");
      } catch (err) {
        if (active) setErrorMsg(err instanceof Error ? err.message : "Could not load formats.");
      } finally {
        if (active) setFormatsLoading(false);
      }
    }
    void initialLoad();
    return () => {
      active = false;
    };
  }, [authFetch]);

  const format = formats.find((f) => f.id === formatId) ?? null;
  const letterheads = me?.company.letterheads ?? [];
  const activeLetterhead =
    selectedLetterheadId === "none"
      ? null
      : letterheads.find((lh) => lh.id === selectedLetterheadId) ?? letterheads[0] ?? null;

  function buildVars() {
    return {
      company_name: me?.company.name ?? "",
      employee_name: employeeName,
      nic,
      position,
      start_date: startDate ? formatDateOnly(startDate) : "",
      end_date: stillEmployed ? "date" : endDate ? formatDateOnly(endDate) : "",
      issue_date: formatDateOnly(todayIso()),
    };
  }

  const preview = format ? renderTemplate(format.body, buildVars()) : "";

  async function getFreshLaceWallet(): Promise<{ wallet: BrowserWallet; address: string }> {
    if (!me) throw new Error("Company context not loaded.");
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
    const connectedKey = walletKey(address);
    const registeredKey = walletKey(me.company.walletAddress);
    if (!registeredKey) {
      throw new Error(
        "No wallet is connected to your company yet. Open Settings, connect your Lace wallet there, then come back."
      );
    }
    if (!connectedKey || !registeredKey || connectedKey !== registeredKey) {
      throw new Error(
        "This is not the wallet your company registered with. Switch to the registered wallet in Lace and connect again."
      );
    }

    walletRef.current = wallet;
    setWalletAddress(address);
    return { wallet, address };
  }

  async function handleConnect() {
    if (!me) return;
    setConnectError("");
    setConnecting(true);
    try {
      await getFreshLaceWallet();
    } catch (err) {
      walletRef.current = null;
      setWalletAddress("");
      setConnectError(err instanceof Error ? err.message : "Could not connect the wallet.");
    } finally {
      setConnecting(false);
    }
  }

  async function confirmOnServer(record: PendingRecord) {
    setStep("confirm");
    setErrorMsg("");
    let failures = 0;

    for (let attempt = 0; attempt < POLL_MAX_TRIES; attempt++) {
      try {
        const res = await authFetch("/api/issue", {
          letterId: record.letterId,
          letterHash: record.letterHash,
          txHash: record.txHash,
          employeeName: record.employeeName,
          position: record.position,
          formatId: record.formatId,
          workStatus: record.workStatus,
        });
        const data = await res.json().catch(() => ({}));

        if (res.status === 200 && data.status === "issued") {
          setIssued({
            letterId: record.letterId,
            txHash: record.txHash,
            letterHash: record.letterHash,
            employeeName: record.employeeName,
            fileName: record.fileName,
            blobUrl: record.blobUrl,
            verifyUrl: record.verifyUrl,
          });
          setPendingRecord(null);
          setStep("done");
          void refresh();
          return;
        }

        if (res.status === 202) {
          failures = 0;
        } else if (res.status === 502) {
          failures++;
          if (failures >= 4) throw new Error(data.error ?? "The blockchain data service is not responding.");
        } else {
          throw new Error(data.error ?? "The server could not record this letter.");
        }
      } catch (err) {
        if (err instanceof TypeError) {
          failures++;
          if (failures >= 4) {
            setErrorMsg("Lost connection to the server. Check your internet and press Check again.");
            setPendingRecord(record);
            setStep("timeout");
            return;
          }
        } else {
          setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
          setPendingRecord(record);
          setStep("timeout");
          return;
        }
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    setErrorMsg(
      "Cardano has not confirmed the transaction yet. Your letter is safe. Press Check again in a minute."
    );
    setPendingRecord(record);
    setStep("timeout");
  }

  async function handleIssue(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    if (!me || !format) {
      setErrorMsg("Choose a format first.");
      return;
    }
    if (me.company.subscriptionPlan === "Free" && me.stats.letters >= 5) {
      setErrorMsg("Free plan limit reached (5 service letters). Please upgrade to Premium ($10/month).");
      return;
    }
    if (!walletAddress) {
      setErrorMsg("Connect your company wallet first.");
      return;
    }
    if (!employeeName.trim() || !position.trim() || !startDate) {
      setErrorMsg("Employee name, position and start date are required.");
      return;
    }
    if (!stillEmployed) {
      if (!endDate) {
        setErrorMsg("Enter the end date, or tick that the employee is still working here.");
        return;
      }
      if (endDate < startDate) {
        setErrorMsg("The end date cannot be before the start date.");
        return;
      }
    }

    try {
      setStep("pdf");
      const letterId = crypto.randomUUID();
      const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || window.location.origin).replace(/\/+$/, "");
      const verifyUrl = `${baseUrl}/verify/${letterId}`;
      const letterheadPdfBytes = await fetchLetterheadBytes(activeLetterhead?.path ?? null);

      const pdfBytes = await generateLetterPdf({
        letterId,
        companyName: me.company.name,
        employeeName: employeeName.trim(),
        body: renderTemplate(format.body, buildVars()),
        signerName: format.signerName,
        signerTitle: format.signerTitle,
        issueDate: todayIso(),
        verifyUrl,
        letterheadPdfBytes,
      });

      const blob = new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });
      const letterHash = await sha256Hex(blob);
      const blobUrl = URL.createObjectURL(blob);
      const fileName = `service-letter-${slug(employeeName)}.pdf`;
      const workStatus = stillEmployed ? "active" : "resigned";

      setStep("sign");
      const { wallet } = await getFreshLaceWallet();
      const { issueLetterOnChain } = await import("@/lib/letter-tx");

      const { txHash } = await issueLetterOnChain(wallet, letterHash);

      await confirmOnServer({
        letterId,
        letterHash,
        txHash,
        employeeName: employeeName.trim(),
        position: position.trim(),
        formatId: format.id,
        workStatus,
        fileName,
        blobUrl,
        verifyUrl,
      });
    } catch (err) {
      setStep("idle");
      const message = err instanceof Error ? err.message : String(err);
      if (/declin|reject|cancel|denied/i.test(message)) {
        setErrorMsg("You cancelled the request in Lace. Nothing was sent.");
      } else if (/confirmation prompt/i.test(message)) {
        setErrorMsg(
          "Lace could not open its popup window. Click the Lace extension icon in your browser toolbar to make sure it is unlocked and no old popup is open, then try again."
        );
      } else if (/shutdown|no longer be used/i.test(message)) {
        walletRef.current = null;
        setWalletAddress("");
        setErrorMsg("Lace wallet session disconnected. Please click 'Connect Lace wallet' again.");
      } else if (/insufficient|utxo|balance/i.test(message)) {
        setErrorMsg(
          "Not enough test ADA in this wallet. Get free Preprod ADA from the Cardano testnet faucet and try again."
        );
      } else {
        setErrorMsg(`Could not issue the letter: ${message}`);
      }
      console.error(err);
    }
  }

  function resetForNext() {
    if (issued) URL.revokeObjectURL(issued.blobUrl);
    setIssued(null);
    setPendingRecord(null);
    setStep("idle");
    setErrorMsg("");
    setEmployeeName("");
    setNic("");
    setPosition("");
    setStartDate("");
    setEndDate("");
    setStillEmployed(false);
  }

  if (!me) return null;

  const isFreeLimitReached =
    me.company.subscriptionPlan === "Free" && me.stats.letters >= 5;

  if (mode === "single" && step === "done" && issued) {
    return (
      <Card className="border-slate-200 shadow-lg">
        <CardHeader className="space-y-2 text-center">
          <div className="flex justify-center">
            <Badge variant="outline" className="border-emerald-300 bg-emerald-100 px-4 py-1 text-sm font-semibold text-emerald-800">
              Recorded on Cardano
            </Badge>
          </div>
          <CardTitle className="text-2xl font-bold text-slate-900">Letter issued</CardTitle>
          <CardDescription>
            The fingerprint of this letter is now on the blockchain. Download the PDF and give it
            to {issued.employeeName}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <a
            href={issued.blobUrl}
            download={issued.fileName}
            className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-indigo-600 px-2.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Download the PDF
          </a>
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
            Download it now and keep this exact file. If it is changed or created again, its
            fingerprint will not match the blockchain record.
          </p>

          <div className="space-y-3 rounded-lg bg-slate-100 p-4">
            <div>
              <span className="mb-1 block text-slate-500">Verification link (also in the QR code)</span>
              <a href={issued.verifyUrl} target="_blank" rel="noopener noreferrer" className="block break-all rounded border bg-white p-2 text-xs text-indigo-700 underline">
                {issued.verifyUrl}
              </a>
            </div>
            <div>
              <span className="mb-1 block text-slate-500">Cardano transaction</span>
              <a href={`https://preprod.cardanoscan.io/transaction/${issued.txHash}`} target="_blank" rel="noopener noreferrer" className="block break-all rounded border bg-white p-2 text-xs text-indigo-700 underline">
                {issued.txHash}
              </a>
            </div>
            <div>
              <span className="mb-1 block text-slate-500">Letter fingerprint (SHA-256)</span>
              <code className="block break-all rounded border bg-white p-2 text-xs text-slate-700">{issued.letterHash}</code>
            </div>
          </div>

          <Button variant="outline" className="w-full" onClick={resetForNext}>
            Issue another letter
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Issue Service Letter</h1>
          <p className="mt-1 text-slate-600">
            Issue a single service letter or upload an Excel sheet to generate letters in bulk.
          </p>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="inline-flex rounded-xl bg-slate-200/80 p-1 self-start">
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode("single")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              mode === "single"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Single Letter
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode("bulk")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              mode === "bulk"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Bulk Generate (Excel)
          </button>
        </div>
      </div>

      <PrivateLettersPromo variant="issue" />

      {/* Free Plan Limit Banner */}
      {me.company.subscriptionPlan === "Free" && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            isFreeLimitReached
              ? "border-red-300 bg-red-50 text-red-900"
              : "border-indigo-200 bg-indigo-50/70 text-indigo-950"
          }`}
        >
          <div>
            <strong>Free Plan Quota:</strong> {me.stats.letters} of 5 service letters used.
            {isFreeLimitReached
              ? " Upgrade to Premium ($10/month) to issue unlimited letters."
              : " Upgrade anytime for unlimited letters."}
          </div>
          <Link href="/dashboard/subscription">
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 shrink-0">
              Upgrade ($10/mo)
            </Button>
          </Link>
        </div>
      )}

      {!me.company.verified && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your company is not verified yet. You can issue letters, but scanners will see
          &quot;Not verified&quot; until Robin&apos;s team approves it.
        </p>
      )}

      {isFreeLimitReached ? (
        <Card className="border-red-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-red-800">Free Plan Limit Reached (5/5 Letters)</CardTitle>
            <CardDescription>
              You have issued all 5 service letters included in the Free Plan. Upgrade to the Premium Plan ($10/month) via PayHere to unlock unlimited service letters.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/subscription">
              <Button className="bg-indigo-600 hover:bg-indigo-700">
                Upgrade to Premium ($10/month)
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : formatsLoading ? (
        <p className="text-sm text-slate-500">Loading formats…</p>
      ) : formats.length === 0 ? (
        <Card className="border-dashed border-slate-300">
          <CardContent className="pt-4 text-sm text-slate-700">
            You have no ready formats yet. Go to{" "}
            <Link href="/dashboard/formats" className="text-indigo-700 underline">
              Manage Formats
            </Link>
            , create one and press <strong>Generate</strong>.
          </CardContent>
        </Card>
      ) : mode === "bulk" ? (
        <BulkIssueSection
          companyName={me.company.name}
          letterheads={letterheads}
          formats={formats}
          walletAddress={walletAddress}
          connecting={connecting}
          connectError={connectError}
          onConnectWallet={handleConnect}
          getFreshLaceWallet={getFreshLaceWallet}
          authFetch={authFetch}
          onRefreshDashboard={refresh}
        />
      ) : (
        <>
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">1. Company wallet</CardTitle>
              <CardDescription>
                Letters are paid for and signed with the wallet your company registered with.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {walletAddress ? (
                <div className="space-y-1 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
                  <Badge className="bg-emerald-600 text-white">Wallet connected</Badge>
                  <code className="block break-all text-xs text-slate-600">{walletAddress}</code>
                </div>
              ) : (
                <Button type="button" onClick={handleConnect} disabled={connecting} className="bg-indigo-600 hover:bg-indigo-700">
                  {connecting ? "Connecting…" : "Connect Lace wallet"}
                </Button>
              )}
              {connectError && (
                <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
                  {connectError}
                </p>
              )}
            </CardContent>
          </Card>

          <form onSubmit={handleIssue}>
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">2. Letter details</CardTitle>
                <CardDescription>Use English letters only.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <fieldset disabled={busy} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="format">Format *</Label>
                      <select
                        id="format"
                        value={formatId}
                        onChange={(e) => setFormatId(e.target.value)}
                        className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {formats.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="singleLetterhead">Company Letterhead</Label>
                      <select
                        id="singleLetterhead"
                        value={activeLetterhead?.id ?? "none"}
                        onChange={(e) => setSelectedLetterheadId(e.target.value)}
                        className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {letterheads.map((lh) => (
                          <option key={lh.id} value={lh.id}>
                            {lh.name}
                          </option>
                        ))}
                        <option value="none">Default Robin Header (No Letterhead)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="employeeName">Employee name *</Label>
                      <Input id="employeeName" value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} maxLength={120} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="nic">NIC number (optional)</Label>
                      <Input id="nic" value={nic} onChange={(e) => setNic(e.target.value)} maxLength={20} />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="position">Position / designation *</Label>
                    <Input id="position" value={position} onChange={(e) => setPosition(e.target.value)} maxLength={120} required />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="startDate">Start date *</Label>
                      <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="endDate">End date</Label>
                      <Input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={stillEmployed} />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={stillEmployed} onChange={(e) => setStillEmployed(e.target.checked)} />
                    The employee is still working here
                  </label>
                </fieldset>

                <Separator />

                <div>
                  <p className="mb-1 text-sm font-medium text-slate-700">Letter preview</p>
                  <div className="whitespace-pre-line rounded-lg border bg-white p-4 text-sm text-slate-800">
                    {preview}
                  </div>
                  {format && (
                    <p className="mt-1 text-xs text-slate-500">
                      Signed by {format.signerName}, {format.signerTitle}. The PDF also gets a
                      QR code{activeLetterhead ? ` and uses "${activeLetterhead.name}"` : ""}.
                    </p>
                  )}
                </div>

                {errorMsg && (
                  <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
                    {errorMsg}
                  </p>
                )}

                {(busy || step === "timeout") && (
                  <ol className="space-y-2 rounded-lg bg-slate-100 p-4 text-sm">
                    {STEP_LABELS.map((s, i) => {
                      const order = ["pdf", "sign", "submit", "confirm"];
                      const current = step === "timeout" ? 3 : order.indexOf(step);
                      const state = i < current ? "done" : i === current ? "active" : "todo";
                      return (
                        <li
                          key={s.key}
                          className={
                            state === "done"
                              ? "text-emerald-700"
                              : state === "active"
                                ? "font-semibold text-slate-900"
                                : "text-slate-400"
                          }
                        >
                          {state === "done" ? "✓" : state === "active" ? "…" : "○"} {s.label}
                        </li>
                      );
                    })}
                  </ol>
                )}

                {step === "timeout" && pendingRecord ? (
                  <Button type="button" className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={() => void confirmOnServer(pendingRecord)}>
                    Check again
                  </Button>
                ) : (
                  <Button type="submit" disabled={busy || !walletAddress || !format} className="w-full bg-indigo-600 hover:bg-indigo-700">
                    {busy ? "Working…" : "Create PDF and record on Cardano"}
                  </Button>
                )}
                <p className="text-xs text-slate-500">
                  Lace will ask you to approve one small transaction (about 2 test ADA that stays
                  locked in the Robin contract and comes back if you revoke the letter, plus a
                  network fee of under 0.3 ADA).
                </p>
              </CardContent>
            </Card>
          </form>
        </>
      )}
    </div>
  );
}