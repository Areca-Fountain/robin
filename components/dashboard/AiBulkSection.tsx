"use client";

import React, { useState } from "react";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import type { BrowserWallet } from "@meshsdk/core";
import type { CompanyLetterhead } from "@/components/dashboard/CompanyProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReadyFormat } from "@/components/dashboard/BulkIssueSection";
import { sha256Hex } from "@/lib/hash";
import { generateLetterPdf } from "@/lib/letter-pdf";
import { fetchLetterheadBytes } from "@/lib/documents-client";
import { formatDateOnly, renderTemplate, todayIso } from "@/lib/letter-format";
import { isAiDesignation, normalizePerformance } from "@/lib/ai-eligibility";
import {
  confirmLetterOnServer,
  friendlyChainError,
  triggerDownload,
  type AuthFetch,
} from "@/lib/confirm-issue";

const MAX_ROWS = 30;
const AI_CHUNK = 20;

interface Row {
  rowNumber: number;
  employeeName: string;
  nic: string;
  position: string;
  startDate: string;
  endDate: string;
  stillEmployed: boolean;
  keyDuty: string;
  performance: string;
}

interface BuiltLetter {
  row: Row;
  letterId: string;
  verifyUrl: string;
  fileName: string;
  blob: Blob;
  letterHash: string;
}

type Phase = "idle" | "generating" | "generated" | "pdf" | "sign" | "confirm" | "timeout" | "done";

interface Props {
  companyName: string;
  letterheads: CompanyLetterhead[];
  formats: ReadyFormat[];
  walletAddress: string;
  connecting: boolean;
  connectError: string;
  onConnectWallet: () => Promise<void>;
  getFreshLaceWallet: () => Promise<{ wallet: BrowserWallet; address: string }>;
  authFetch: AuthFetch;
  onRefreshDashboard: () => Promise<void>;
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "employee";
}

function keySlug(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizeDate(raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return "";
  if (typeof raw === "number") {
    const p = XLSX.SSF.parse_date_code(raw);
    if (p) return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  }
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return s;
}

export function AiBulkSection({
  companyName,
  letterheads,
  formats,
  walletAddress,
  connecting,
  connectError,
  onConnectWallet,
  getFreshLaceWallet,
  authFetch,
  onRefreshDashboard,
}: Props) {
  const [formatId, setFormatId] = useState(formats[0]?.id ?? "");
  const [selectedLetterheadId, setSelectedLetterheadId] = useState("");

  const format = formats.find((f) => f.id === formatId) ?? formats[0] ?? null;
  const activeLetterhead =
    selectedLetterheadId === "none"
      ? null
      : letterheads.find((lh) => lh.id === selectedLetterheadId) ?? letterheads[0] ?? null;

  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [aiLines, setAiLines] = useState<(string | null)[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  const [txHash, setTxHash] = useState("");
  const [zipUrl, setZipUrl] = useState("");
  const [failedNames, setFailedNames] = useState<string[]>([]);
  const [pending, setPending] = useState<{ built: BuiltLetter[]; txHash: string } | null>(null);

  const working = phase === "generating" || phase === "pdf" || phase === "sign" || phase === "confirm";
  const aiCount = rows.filter((r) => isAiDesignation(r.position)).length;

  function resetAll() {
    if (zipUrl) URL.revokeObjectURL(zipUrl);
    setRows([]);
    setAiLines([]);
    setFileName("");
    setPhase("idle");
    setProgress("");
    setError("");
    setTxHash("");
    setZipUrl("");
    setFailedNames([]);
    setPending(null);
  }

  function handleDownloadTemplate() {
    const headers = ["employee_name", "nic", "position", "start_date", "end_date", "still_employed", "key_duty", "performance"];
    const sample = {
      employee_name: "Kasun Perera",
      nic: "199812345678",
      position: "HR Manager",
      start_date: "2024-01-15",
      end_date: "2026-11-20",
      still_employed: "NO",
      key_duty: "leading the recruitment team",
      performance: "Excellent",
    };
    const sheet = XLSX.utils.json_to_sheet([sample], { header: headers });
    sheet["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 6, 18) }));
    for (let r = 2; r <= 500; r++) {
      const ref = `B${r}`;
      if (!sheet[ref]) sheet[ref] = { t: "s", v: "", z: "@" };
      else {
        sheet[ref].t = "s";
        sheet[ref].z = "@";
      }
    }
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Employees");
    XLSX.writeFile(book, `robin-ai-template-${slug(format?.name ?? "format")}.xlsx`);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    resetAll();
    setFileName(file.name);
    try {
      const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheetName = book.SheetNames[0];
      if (!sheetName) throw new Error("The Excel file has no sheets.");
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[sheetName], { defval: "" });
      if (json.length === 0) throw new Error("The Excel sheet is empty. Add at least one employee row.");
      if (json.length > MAX_ROWS) {
        throw new Error(`Please upload at most ${MAX_ROWS} employees at a time (this file has ${json.length}).`);
      }

      const parsed: Row[] = json.map((raw, i) => {
        const n: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(raw)) n[keySlug(k)] = v;

        const employeeName = String(n.employee_name ?? "").trim();
        const position = String(n.position ?? "").trim();
        const startDate = normalizeDate(n.start_date);
        const still = ["yes", "true", "1", "y"].includes(String(n.still_employed ?? "").trim().toLowerCase());
        const endDate = still ? "" : normalizeDate(n.end_date);
        const where = `Row ${i + 2}${employeeName ? ` (${employeeName})` : ""}`;

        if (!employeeName) throw new Error(`${where}: employee_name is required.`);
        if (!position) throw new Error(`${where}: position is required.`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error(`${where}: start_date must be a valid date (YYYY-MM-DD).`);
        if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new Error(`${where}: end_date must be a valid date (YYYY-MM-DD).`);
        if (endDate && endDate < startDate) throw new Error(`${where}: end_date is before start_date.`);

        return {
          rowNumber: i + 2,
          employeeName,
          nic: String(n.nic ?? "").trim(),
          position,
          startDate,
          endDate,
          stillEmployed: still,
          keyDuty: String(n.key_duty ?? "").trim().slice(0, 100),
          performance: normalizePerformance(n.performance),
        };
      });
      setRows(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the Excel file.");
    }
  }

  async function handleGenerate() {
    if (rows.length === 0) return;
    setError("");
    setPhase("generating");
    try {
      const lines: (string | null)[] = [];
      for (let i = 0; i < rows.length; i += AI_CHUNK) {
        const chunk = rows.slice(i, i + AI_CHUNK);
        setProgress(`Writing text with Robin AI… ${Math.min(i + AI_CHUNK, rows.length)} / ${rows.length}`);
        const res = await authFetch("/api/ai/generate", {
          mode: "bulk",
          items: chunk.map((r) => ({
            position: r.position,
            startDate: r.startDate,
            endDate: r.endDate,
            stillEmployed: r.stillEmployed,
            keyDuty: r.keyDuty,
            performance: r.performance,
          })),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Robin AI could not write the text.");
        lines.push(...((data.lines as (string | null)[]) ?? chunk.map(() => null)));
      }
      setAiLines(lines);
      setPhase("generated");
    } catch (err) {
      setPhase("idle");
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setProgress("");
    }
  }

  async function confirmAndFinish(built: BuiltLetter[], tx: string) {
    if (!format) return;
    setPhase("confirm");
    setError("");

    const payloadOf = (b: BuiltLetter) => ({
      letterId: b.letterId,
      letterHash: b.letterHash,
      txHash: tx,
      employeeName: b.row.employeeName,
      position: b.row.position,
      formatId: format.id,
    });

    try {
      await confirmLetterOnServer(authFetch, payloadOf(built[0]));
      const rest = await Promise.allSettled(built.slice(1).map((b) => confirmLetterOnServer(authFetch, payloadOf(b))));
      const failed = built.slice(1).filter((_, i) => rest[i].status === "rejected");
      const ok = built.filter((b) => !failed.includes(b));

      const zip = new JSZip();
      for (const b of ok) zip.file(b.fileName, b.blob);
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);

      setZipUrl(url);
      setFailedNames(failed.map((b) => b.row.employeeName));
      setTxHash(tx);
      setPending(null);
      setPhase("done");
      triggerDownload(url, `robin-ai-service-letters-${todayIso()}.zip`);
      void onRefreshDashboard();
    } catch (err) {
      setPending({ built, txHash: tx });
      setError(err instanceof Error ? err.message : "Something went wrong while confirming.");
      setPhase("timeout");
    }
  }

  async function handleRecord() {
    if (!format || rows.length === 0) return;
    if (!walletAddress) {
      setError("Connect your company wallet first.");
      return;
    }
    setError("");

    try {
      setPhase("pdf");
      const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || window.location.origin).replace(/\/+$/, "");
      const letterheadPdfBytes = await fetchLetterheadBytes(activeLetterhead?.path ?? null);
      const built: BuiltLetter[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        setProgress(`Creating PDF ${i + 1} / ${rows.length}`);
        const letterId = crypto.randomUUID();
        const verifyUrl = `${baseUrl}/verify/${letterId}`;

        const base = renderTemplate(format.body, {
          company_name: companyName,
          employee_name: row.employeeName,
          nic: row.nic,
          position: row.position,
          start_date: formatDateOnly(row.startDate),
          end_date: row.stillEmployed ? "date" : formatDateOnly(row.endDate || todayIso()),
          issue_date: formatDateOnly(todayIso()),
        });
        const ai = aiLines[i]?.trim();
        const body = ai ? `${base}\n\n${ai}` : base;

        const bytes = await generateLetterPdf({
          letterId,
          companyName,
          employeeName: row.employeeName,
          body,
          signerName: format.signerName,
          signerTitle: format.signerTitle,
          issueDate: todayIso(),
          verifyUrl,
          letterheadPdfBytes,
        });
        const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
        built.push({
          row,
          letterId,
          verifyUrl,
          fileName: `service-letter-${i + 1}-${slug(row.employeeName)}.pdf`,
          blob,
          letterHash: await sha256Hex(blob),
        });
      }

      setProgress("");
      setPhase("sign");
      const { wallet } = await getFreshLaceWallet();
      const { issueBulkLettersOnChain } = await import("@/lib/letter-tx");
      const { txHash: tx } = await issueBulkLettersOnChain(wallet, built.map((b) => b.letterHash));

      await confirmAndFinish(built, tx);
    } catch (err) {
      setPhase("generated");
      setProgress("");
      const message = err instanceof Error ? err.message : String(err);
      setError(friendlyChainError(message));
      console.error(err);
    }
  }

  const generated = phase === "generated" || phase === "pdf" || phase === "sign" || phase === "confirm" || phase === "timeout";

  if (phase === "done") {
    return (
      <Card className="border-slate-200 shadow-lg">
        <CardHeader className="space-y-2 text-center">
          <div className="flex justify-center">
            <Badge variant="outline" className="border-emerald-300 bg-emerald-100 px-4 py-1 text-sm font-semibold text-emerald-800">
              Recorded on Cardano
            </Badge>
          </div>
          <CardTitle className="text-2xl font-bold text-slate-900">Completed</CardTitle>
          <CardDescription>
            {rows.length - failedNames.length} service letters were recorded in one Cardano transaction. The ZIP with all
            PDFs was downloaded.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <Button className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={() => triggerDownload(zipUrl, `robin-ai-service-letters-${todayIso()}.zip`)}>
            Download the ZIP again
          </Button>
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
            Keep these exact PDF files. If a PDF is changed or created again, its fingerprint will not match the
            blockchain record.
          </p>
          {failedNames.length > 0 && (
            <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-red-800" role="alert">
              These letters could not be saved and are not in the ZIP: {failedNames.join(", ")}.
            </p>
          )}
          <div>
            <span className="mb-1 block text-slate-500">Cardano transaction</span>
            <a
              href={`https://preprod.cardanoscan.io/transaction/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block break-all rounded border bg-white p-2 text-xs text-indigo-700 underline"
            >
              {txHash}
            </a>
          </div>
          <Button variant="outline" className="w-full" onClick={resetAll}>
            Start another batch
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">1. Format, Letterhead and Excel sheet</CardTitle>
          <CardDescription>
            Choose a format and letterhead, download the Excel template, fill in your employees (up to {MAX_ROWS}) and upload it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="aiBulkFormat">Format *</Label>
              <select
                id="aiBulkFormat"
                value={format?.id ?? ""}
                disabled={working}
                onChange={(e) => setFormatId(e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {formats.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="aiBulkLetterhead">Company Letterhead</Label>
              <select
                id="aiBulkLetterhead"
                value={activeLetterhead?.id ?? "none"}
                disabled={working}
                onChange={(e) => setSelectedLetterheadId(e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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

          <Button type="button" variant="outline" onClick={handleDownloadTemplate} disabled={!format} className="border-indigo-300 text-indigo-700 hover:bg-indigo-50">
            ↓ Download Excel Template (.xlsx)
          </Button>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input type="file" accept=".xlsx,.xls,.csv" disabled={working || !format} onChange={handleUpload} className="max-w-md cursor-pointer" />
            {fileName && (
              <span className="text-xs text-slate-500">
                Loaded: <strong>{fileName}</strong>
              </span>
            )}
          </div>

          {rows.length > 0 && (
            <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
              <strong>{rows.length}</strong> employees found. Robin AI will add a sentence to <strong>{aiCount}</strong>{" "}
              of them. Optional columns <code>key_duty</code> and <code>performance</code> (Excellent, Very Good, Good or Satisfactory) go into that sentence. If <code>key_duty</code> is empty, the AI names a typical duty for the title.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">2. Generate with Robin AI</CardTitle>
          <CardDescription>No previews for bulk letters. You will see &quot;Completed&quot; when it is ready.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {phase === "generating" && <p className="text-sm font-medium text-indigo-700">{progress || "Generating…"}</p>}

          {generated && (
            <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
              ✓ Generate Complete. {rows.length} letters are ready.
            </p>
          )}

          <Button
            type="button"
            onClick={handleGenerate}
            disabled={rows.length === 0 || working || generated}
            className="w-full bg-indigo-600 hover:bg-indigo-700"
          >
            {phase === "generating" ? "Generating…" : generated ? "Completed" : "Generate"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">3. Company wallet and Cardano</CardTitle>
          <CardDescription>One click creates every PDF, one Lace approval records them all.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {walletAddress ? (
            <div className="space-y-1 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
              <Badge className="bg-emerald-600 text-white">Wallet connected</Badge>
              <code className="block break-all text-xs text-slate-600">{walletAddress}</code>
            </div>
          ) : (
            <Button type="button" onClick={onConnectWallet} disabled={connecting} className="bg-indigo-600 hover:bg-indigo-700">
              {connecting ? "Connecting…" : "Connect Lace wallet"}
            </Button>
          )}
          {connectError && (
            <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
              {connectError}
            </p>
          )}

          {error && (
            <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
              {error}
            </p>
          )}

          {(phase === "pdf" || phase === "sign" || phase === "confirm") && (
            <p className="rounded-lg bg-slate-100 p-4 text-sm font-medium text-slate-900">
              {phase === "pdf" && (progress || "Creating the PDFs…")}
              {phase === "sign" && "Approve the transaction in Lace…"}
              {phase === "confirm" && "Waiting for Cardano to confirm (this can take a minute)…"}
            </p>
          )}

          {phase === "timeout" && pending ? (
            <Button type="button" className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={() => void confirmAndFinish(pending.built, pending.txHash)}>
              Check again
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleRecord}
              disabled={!generated || working || !walletAddress}
              className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {working ? "Working…" : "Generate PDF and Record on Cardano"}
            </Button>
          )}
          <p className="text-xs text-slate-500">
            About 2 test ADA per letter stays locked in the Robin contract (it comes back if you revoke the letter), plus a
            small network fee.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}