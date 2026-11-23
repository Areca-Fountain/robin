"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { BrowserWallet } from "@meshsdk/core";
import { useCompany } from "@/components/dashboard/CompanyProvider";
import { AiBulkSection } from "@/components/dashboard/AiBulkSection";
import type { ReadyFormat } from "@/components/dashboard/BulkIssueSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { sha256Hex } from "@/lib/hash";
import { generateLetterPdf } from "@/lib/letter-pdf";
import { formatDateOnly, renderTemplate, todayIso } from "@/lib/letter-format";
import { walletKey } from "@/lib/wallet-key";
import { fetchLetterheadBytes } from "@/lib/documents-client";
import { AI_MAX_LINE_CHARS, PERFORMANCE_LEVELS, isAiDesignation } from "@/lib/ai-eligibility";
import {
  confirmLetterOnServer,
  friendlyChainError,
  triggerDownload,
  type ConfirmPayload,
} from "@/lib/confirm-issue";

type Mode = "single" | "bulk";
type Step = "idle" | "pdf" | "sign" | "confirm" | "timeout" | "done";

interface Pending extends ConfirmPayload {
  fileName: string;
  blobUrl: string;
  verifyUrl: string;
}

const STEPS = [
  { key: "pdf", label: "Creating the PDF" },
  { key: "sign", label: "Approve in Lace" },
  { key: "confirm", label: "Waiting for Cardano confirmation" },
];

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "employee";
}

export default function GenerateWithRobinAiPage() {
  const { me, authFetch, refresh } = useCompany();
  const walletRef = useRef<BrowserWallet | null>(null);

  const [mode, setMode] = useState<Mode>("single");

  const [formats, setFormats] = useState<ReadyFormat[]>([]);
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
  const [keyDuty, setKeyDuty] = useState("");
  const [performance, setPerformance] = useState("");

  const [aiLine, setAiLine] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedKey, setGeneratedKey] = useState("");

  const [step, setStep] = useState<Step>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [issued, setIssued] = useState<Pending | null>(null);

  const busy = step === "pdf" || step === "sign" || step === "confirm";

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await authFetch("/api/formats", { action: "list" });
        const data = await res.json();
        if (!active) return;
        if (!res.ok) throw new Error(data.error ?? "Could not load formats.");
        const ready = (data.formats as ReadyFormat[]).filter((f) => f.status === "Generated");
        setFormats(ready);
        setFormatId((cur) => cur || ready[0]?.id || "");
      } catch (err) {
        if (active) setErrorMsg(err instanceof Error ? err.message : "Could not load formats.");
      } finally {
        if (active) setFormatsLoading(false);
      }
    }
    void load();
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

  const inputsKey = JSON.stringify([formatId, employeeName.trim(), nic.trim(), position.trim(), startDate, stillEmployed, stillEmployed ? "" : endDate, keyDuty.trim(), performance]);
  const previewReady = generatedKey !== "" && generatedKey === inputsKey;

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

  const baseText = format ? renderTemplate(format.body, buildVars()) : "";
  const finalBody = aiLine.trim() ? `${baseText}\n\n${aiLine.trim()}` : baseText;
  const willUseAi = isAiDesignation(position);

  async function getFreshLaceWallet(): Promise<{ wallet: BrowserWallet; address: string }> {
    if (!me) throw new Error("Company context not loaded.");
    const mesh = await import("@meshsdk/core");

    let wallet: BrowserWallet;
    try {
      wallet = await mesh.BrowserWallet.enable("lace");
    } catch {
      throw new Error("Could not open Lace. Install the Lace extension, unlock it, refresh this page and try again.");
    }
    if ((await wallet.getNetworkId()) !== 0) {
      throw new Error("Lace is on the Cardano mainnet. Switch Lace to the Preprod test network and connect again.");
    }

    const address = await wallet.getChangeAddress();
    const connectedKey = walletKey(address);
    const registeredKey = walletKey(me.company.walletAddress);
    if (!registeredKey) {
      throw new Error("No wallet is connected to your company yet. Open Settings, connect your Lace wallet there, then come back.");
    }
    if (!connectedKey || !registeredKey || connectedKey !== registeredKey) {
      throw new Error("This is not the wallet your company registered with. Switch to the registered wallet in Lace and connect again.");
    }

    walletRef.current = wallet;
    setWalletAddress(address);
    return { wallet, address };
  }

  async function handleConnect() {
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

  function validateInputs(): string | null {
    if (!format) return "Choose a format first.";
    if (!employeeName.trim() || !position.trim() || !startDate) {
      return "Employee name, position and start date are required.";
    }
    if (!stillEmployed) {
      if (!endDate) return "Enter the end date, or tick that the employee is still working here.";
      if (endDate < startDate) return "The end date cannot be before the start date.";
    }
    return null;
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    const problem = validateInputs();
    if (problem) {
      setErrorMsg(problem);
      return;
    }

    setGenerating(true);
    try {
      let line = "";
      if (isAiDesignation(position)) {
        const res = await authFetch("/api/ai/generate", {
          mode: "single",
          items: [
            {
              position: position.trim(),
              startDate,
              endDate: stillEmployed ? "" : endDate,
              stillEmployed,
              keyDuty: keyDuty.trim(),
              performance,
            },
          ],
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Robin AI could not write the text.");
        line = (data.lines?.[0] as string | null) ?? "";
      }
      setAiLine(line);
      setGeneratedKey(inputsKey);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Robin AI could not write the text.");
    } finally {
      setGenerating(false);
    }
  }

  async function confirm(record: Pending) {
    setStep("confirm");
    setErrorMsg("");
    try {
      await confirmLetterOnServer(authFetch, record);
      setIssued(record);
      setPending(null);
      setStep("done");
      triggerDownload(record.blobUrl, record.fileName);
      void refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
      setPending(record);
      setStep("timeout");
    }
  }

  async function handleRecord() {
    setErrorMsg("");
    if (!me || !format) return;
    if (me.company.subscriptionPlan === "Free" && me.stats.letters >= 5) {
      setErrorMsg("Free plan limit reached (5 service letters). Please upgrade to Premium ($10/month).");
      return;
    }
    if (!walletAddress) {
      setErrorMsg("Connect your company wallet first.");
      return;
    }
    const problem = validateInputs();
    if (problem || !previewReady) {
      setErrorMsg(problem ?? "Press Generate again. The details changed after the preview.");
      return;
    }

    try {
      setStep("pdf");
      const letterId = crypto.randomUUID();
      const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || window.location.origin).replace(/\/+$/, "");
      const verifyUrl = `${baseUrl}/verify/${letterId}`;
      const letterheadPdfBytes = await fetchLetterheadBytes(activeLetterhead?.path ?? null);

      const bytes = await generateLetterPdf({
        letterId,
        companyName: me.company.name,
        employeeName: employeeName.trim(),
        body: finalBody,
        signerName: format.signerName,
        signerTitle: format.signerTitle,
        issueDate: todayIso(),
        verifyUrl,
        letterheadPdfBytes,
      });
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      const letterHash = await sha256Hex(blob);
      const blobUrl = URL.createObjectURL(blob);

      setStep("sign");
      const { wallet } = await getFreshLaceWallet();
      const { issueLetterOnChain } = await import("@/lib/letter-tx");
      const { txHash } = await issueLetterOnChain(wallet, letterHash);

      await confirm({
        letterId,
        letterHash,
        txHash,
        employeeName: employeeName.trim(),
        position: position.trim(),
        formatId: format.id,
        fileName: `service-letter-${slug(employeeName)}.pdf`,
        blobUrl,
        verifyUrl,
      });
    } catch (err) {
      setStep("idle");
      const message = err instanceof Error ? err.message : String(err);
      if (/shutdown|no longer be used/i.test(message)) {
        walletRef.current = null;
        setWalletAddress("");
      }
      setErrorMsg(friendlyChainError(message));
      console.error(err);
    }
  }

  function resetForNext() {
    if (issued) URL.revokeObjectURL(issued.blobUrl);
    setIssued(null);
    setPending(null);
    setStep("idle");
    setErrorMsg("");
    setEmployeeName("");
    setNic("");
    setPosition("");
    setStartDate("");
    setEndDate("");
    setStillEmployed(false);
    setKeyDuty("");
    setPerformance("");
    setAiLine("");
    setGeneratedKey("");
  }

  if (!me) return null;

  const isPremium = me.company.subscriptionPlan === "Premium";
  const freeLimitReached = me.company.subscriptionPlan === "Free" && me.stats.letters >= 5;

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
            The PDF for {issued.employeeName} was downloaded. If it did not start, use the button below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <a
            href={issued.blobUrl}
            download={issued.fileName}
            className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-indigo-600 px-2.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Download the PDF again
          </a>
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
            Keep this exact file. If it is changed or created again, its fingerprint will not match the blockchain record.
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
            Generate another letter
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Generate with Robin AI</h1>
          <p className="mt-1 text-slate-600">Issue service letters with a short AI-written sentence, single or in bulk.</p>
        </div>
        <div className="inline-flex self-start rounded-xl bg-slate-200/80 p-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode("single")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${mode === "single" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"}`}
          >
            Single Letter
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode("bulk")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${mode === "bulk" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"}`}
          >
            Bulk Generate {!isPremium && "(Premium)"}
          </button>
        </div>
      </div>

      {!me.company.verified && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your company is not verified yet. You can issue letters, but scanners will see &quot;Not verified&quot; until
          Robin&apos;s team approves it.
        </p>
      )}

      {formatsLoading ? (
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
        isPremium ? (
          <AiBulkSection
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
          <Card className="border-indigo-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Bulk generation is a Premium feature</CardTitle>
              <CardDescription>
                Upload an Excel sheet and let Robin AI write and record all your letters at once. Upgrade to Premium ($10/month).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/dashboard/subscription">
                <Button className="bg-indigo-600 hover:bg-indigo-700">Upgrade to Premium</Button>
              </Link>
            </CardContent>
          </Card>
        )
      ) : freeLimitReached ? (
        <Card className="border-red-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-red-800">Free Plan Limit Reached (5/5 Letters)</CardTitle>
            <CardDescription>Upgrade to Premium ($10/month) to issue unlimited service letters.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/subscription">
              <Button className="bg-indigo-600 hover:bg-indigo-700">Upgrade to Premium</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">1. Company wallet</CardTitle>
              <CardDescription>Letters are signed with the wallet your company registered with.</CardDescription>
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

          <form onSubmit={handleGenerate}>
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">2. Letter details</CardTitle>
                <CardDescription>Use English letters only.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <fieldset disabled={busy || generating} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="aiFormat">Format *</Label>
                      <select
                        id="aiFormat"
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
                      <Label htmlFor="aiLetterhead">Company Letterhead</Label>
                      <select
                        id="aiLetterhead"
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
                      <Label htmlFor="aiName">Employee name *</Label>
                      <Input id="aiName" value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} maxLength={120} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="aiNic">NIC number (optional)</Label>
                      <Input id="aiNic" value={nic} onChange={(e) => setNic(e.target.value)} maxLength={20} />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="aiPosition">Designation / position *</Label>
                    <Input id="aiPosition" value={position} onChange={(e) => setPosition(e.target.value)} maxLength={120} placeholder="e.g. HR Manager" required />
                    <p className="text-xs text-slate-500">
                      Robin AI adds a short sentence about this designation to the letter.
                    </p>
                  </div>

                  {willUseAi && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="aiDuty">Key duty to highlight (optional)</Label>
                        <Input id="aiDuty" value={keyDuty} onChange={(e) => setKeyDuty(e.target.value)} maxLength={100} placeholder="e.g. leading the recruitment team" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="aiPerf">Performance (optional)</Label>
                        <select
                          id="aiPerf"
                          value={performance}
                          onChange={(e) => setPerformance(e.target.value)}
                          className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          <option value="">Do not mention</option>
                          {PERFORMANCE_LEVELS.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="aiStart">Start date *</Label>
                      <Input id="aiStart" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="aiEnd">End date</Label>
                      <Input id="aiEnd" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={stillEmployed} />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={stillEmployed} onChange={(e) => setStillEmployed(e.target.checked)} />
                    The employee is still working here
                  </label>
                </fieldset>

                <Button type="submit" disabled={busy || generating || !format} className="w-full bg-indigo-600 hover:bg-indigo-700">
                  {generating ? "Robin AI is writing…" : willUseAi ? "Generate with Robin AI" : "Generate preview"}
                </Button>

                {errorMsg && (
                  <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
                    {errorMsg}
                  </p>
                )}

                {previewReady && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-slate-700">Letter preview</p>
                    <div className="whitespace-pre-line rounded-lg border bg-white p-4 text-sm text-slate-800">{baseText}</div>

                    {willUseAi && (
                      <div className="space-y-1.5">
                        <Label htmlFor="aiLine">Robin AI sentence (you can edit it)</Label>
                        <textarea
                          id="aiLine"
                          value={aiLine}
                          onChange={(e) => setAiLine(e.target.value.slice(0, AI_MAX_LINE_CHARS))}
                          disabled={busy}
                          rows={3}
                          placeholder="Robin AI did not return a sentence. You can type one or leave this empty."
                          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        />
                        <p className="text-xs text-slate-500">
                          AI text can be wrong. Please read it before you issue the letter. {aiLine.length}/{AI_MAX_LINE_CHARS}
                        </p>
                      </div>
                    )}
                    <p className="text-xs text-slate-500">
                      Signed by {format?.signerName}, {format?.signerTitle}. The PDF also gets a QR code
                      {activeLetterhead ? ` and uses "${activeLetterhead.name}"` : ""}.
                    </p>
                  </div>
                )}

                {(busy || step === "timeout") && (
                  <ol className="space-y-2 rounded-lg bg-slate-100 p-4 text-sm">
                    {STEPS.map((s, i) => {
                      const order = ["pdf", "sign", "confirm"];
                      const current = step === "timeout" ? 2 : order.indexOf(step);
                      const state = i < current ? "done" : i === current ? "active" : "todo";
                      return (
                        <li key={s.key} className={state === "done" ? "text-emerald-700" : state === "active" ? "font-semibold text-slate-900" : "text-slate-400"}>
                          {state === "done" ? "✓" : state === "active" ? "…" : "○"} {s.label}
                        </li>
                      );
                    })}
                  </ol>
                )}

                {step === "timeout" && pending ? (
                  <Button type="button" className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={() => void confirm(pending)}>
                    Check again
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={handleRecord}
                    disabled={busy || generating || !walletAddress || !previewReady}
                    className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    {busy ? "Working…" : "Generate PDF and Record on Cardano"}
                  </Button>
                )}
                <p className="text-xs text-slate-500">
                  Lace will ask you to approve one small transaction (about 2 test ADA that stays locked in the Robin contract
                  and comes back if you revoke the letter, plus a network fee of under 0.3 ADA).
                </p>
              </CardContent>
            </Card>
          </form>
        </>
      )}
    </div>
  );
}