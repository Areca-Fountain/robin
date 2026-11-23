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
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { sha256Hex } from "@/lib/hash";
import { generateLetterPdf } from "@/lib/letter-pdf";
import { fetchLetterheadBytes } from "@/lib/documents-client";
import {
  formatDateOnly,
  renderBulkTemplate,
  todayIso,
  type ExtraCustomField,
} from "@/lib/letter-format";

export interface ReadyFormat {
  id: string;
  name: string;
  body: string;
  signerName: string;
  signerTitle: string;
  status: "Draft" | "Generated";
}

interface GeneratedBulkItem {
  letterId: string;
  rowIndex: number;
  employeeName: string;
  nic: string;
  position: string;
  startDate: string;
  endDate: string;
  stillEmployed: boolean;
  extraValues: Record<string, string>;
  renderedBody: string;
  fileName: string;
  blob: Blob;
  blobUrl: string;
  letterHash: string;
  verifyUrl: string;
  onChainStatus: "draft" | "issuing" | "issued" | "error";
  txHash?: string;
  errorText?: string;
}

interface BulkIssueSectionProps {
  companyName: string;
  letterheads: CompanyLetterhead[];
  formats: ReadyFormat[];
  walletAddress: string;
  connecting: boolean;
  connectError: string;
  onConnectWallet: () => Promise<void>;
  getFreshLaceWallet: () => Promise<{ wallet: BrowserWallet; address: string }>;
  authFetch: (url: string, body: Record<string, unknown>) => Promise<Response>;
  onRefreshDashboard: () => Promise<void>;
}

const POLL_INTERVAL_MS = 5000;
const POLL_MAX_TRIES = 36;

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "employee"
  );
}

function toKeySlug(label: string): string {
  return (
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "custom_field"
  );
}

/** Converts Excel serial dates or string dates into YYYY-MM-DD */
function normalizeExcelDate(raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return "";
  if (typeof raw === "number") {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (parsed) {
      const mm = String(parsed.m).padStart(2, "0");
      const dd = String(parsed.d).padStart(2, "0");
      return `${parsed.y}-${mm}-${dd}`;
    }
  }
  const str = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const d = new Date(str);
  if (!Number.isNaN(d.getTime())) {
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
  }
  return str;
}

export function BulkIssueSection({
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
}: BulkIssueSectionProps) {
  const [formatId, setFormatId] = useState<string>(formats[0]?.id ?? "");
  const [selectedLetterheadId, setSelectedLetterheadId] = useState<string>("");

  const activeFormat = formats.find((f) => f.id === formatId) ?? formats[0] ?? null;
  const activeLetterhead =
    selectedLetterheadId === "none"
      ? null
      : letterheads.find((lh) => lh.id === selectedLetterheadId) ?? letterheads[0] ?? null;

  // Extra Custom Fields State
  const [extraFields, setExtraFields] = useState<ExtraCustomField[]>([]);
  const [newFieldLabel, setNewFieldLabel] = useState("");

  // Excel Upload & Generation States
  const [excelFileName, setExcelFileName] = useState("");
  const [generatingBulk, setGeneratingBulk] = useState(false);
  const [bulkItems, setBulkItems] = useState<GeneratedBulkItem[]>([]);
  const [bulkError, setBulkError] = useState("");
  const [bulkMessage, setBulkMessage] = useState("");

  // Preview Modal State
  const [previewItem, setPreviewItem] = useState<GeneratedBulkItem | null>(null);

  // Batch Cardano Recording State
  const [issuingAllOnChain, setIssuingAllOnChain] = useState(false);
  const [zipDownloading, setZipDownloading] = useState(false);

  const handleAddExtraField = () => {
    const trimmed = newFieldLabel.trim();
    if (!trimmed) return;
    const key = toKeySlug(trimmed);

    const reserved = new Set([
      "company_name",
      "employee_name",
      "nic",
      "position",
      "start_date",
      "end_date",
      "issue_date",
      "still_employed",
    ]);

    if (reserved.has(key) || extraFields.some((f) => f.key === key)) {
      setBulkError(`Field "${trimmed}" already exists in the template.`);
      return;
    }

    setBulkError("");
    setExtraFields((prev) => [...prev, { key, label: trimmed }]);
    setNewFieldLabel("");
  };

  const handleRemoveExtraField = (key: string) => {
    setExtraFields((prev) => prev.filter((f) => f.key !== key));
  };

  const handleDownloadTemplate = () => {
    if (!activeFormat) return;

    const baseHeaders = [
      "employee_name",
      "nic",
      "position",
      "start_date",
      "end_date",
      "still_employed",
    ];
    const extraHeaders = extraFields.map((f) => f.key);
    const allHeaders = [...baseHeaders, ...extraHeaders];

    const sampleRow: Record<string, string> = {
      employee_name: "Kasun Perera",
      nic: "199812345678",
      position: "Software Engineer",
      start_date: "2024-01-15",
      end_date: "2026-11-20",
      still_employed: "NO",
    };

    for (const f of extraFields) {
      sampleRow[f.key] = `Sample ${f.label}`;
    }

    const worksheet = XLSX.utils.json_to_sheet([sampleRow], { header: allHeaders });
    worksheet["!cols"] = allHeaders.map((h) => ({
      wch: Math.max(h.length + 6, 18),
      ...(h === "nic" ? { z: "@" } : {}),
    }));

    for (let row = 2; row <= 500; row++) {
      const cellRef = `B${row}`;
      if (!worksheet[cellRef]) {
        worksheet[cellRef] = { t: "s", v: "", z: "@" };
      } else {
        worksheet[cellRef].t = "s";
        worksheet[cellRef].z = "@";
      }
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Employees");

    const safeName = slug(activeFormat.name);
    XLSX.writeFile(workbook, `robin-template-${safeName}.xlsx`);
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeFormat) return;

    setBulkError("");
    setBulkMessage("");
    setGeneratingBulk(true);
    setExcelFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error("The uploaded Excel file has no sheets.");

      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
        defval: "",
      });

      if (rows.length === 0) {
        throw new Error("The Excel sheet is empty. Add at least one employee row.");
      }

      bulkItems.forEach((item) => URL.revokeObjectURL(item.blobUrl));

      const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || window.location.origin).replace(
        /\/+$/,
        ""
      );
      const letterheadPdfBytes = await fetchLetterheadBytes(activeLetterhead?.path ?? null);
      const generated: GeneratedBulkItem[] = [];

      for (let i = 0; i < rows.length; i++) {
        const rawRow = rows[i];
        const norm: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rawRow)) {
          norm[toKeySlug(k)] = v;
        }

        const empName = String(norm["employee_name"] ?? "").trim();
        const nic = String(norm["nic"] ?? "").trim();
        const position = String(norm["position"] ?? "").trim();
        const startDate = normalizeExcelDate(norm["start_date"]);
        const stillRaw = String(norm["still_employed"] ?? "").trim().toLowerCase();
        const stillEmployed =
          stillRaw === "yes" || stillRaw === "true" || stillRaw === "1" || stillRaw === "y";
        const endDate = stillEmployed ? "" : normalizeExcelDate(norm["end_date"]);

        if (!empName) {
          throw new Error(`Row ${i + 2}: "employee_name" is required.`);
        }
        if (!position) {
          throw new Error(`Row ${i + 2} (${empName}): "position" is required.`);
        }
        if (!startDate) {
          throw new Error(`Row ${i + 2} (${empName}): "start_date" is required (YYYY-MM-DD).`);
        }

        const extraValues: Record<string, string> = {};
        for (const field of extraFields) {
          extraValues[field.key] = String(norm[field.key] ?? "").trim();
        }

        const renderedBody = renderBulkTemplate(
          activeFormat.body,
          {
            company_name: companyName,
            employee_name: empName,
            nic,
            position,
            start_date: formatDateOnly(startDate),
            end_date: stillEmployed
              ? "date"
              : endDate
              ? formatDateOnly(endDate)
              : formatDateOnly(todayIso()),
            issue_date: formatDateOnly(todayIso()),
          },
          extraFields,
          extraValues
        );

        const letterId = crypto.randomUUID();
        const verifyUrl = `${baseUrl}/verify/${letterId}`;

        const pdfBytes = await generateLetterPdf({
          letterId,
          companyName,
          employeeName: empName,
          body: renderedBody,
          signerName: activeFormat.signerName,
          signerTitle: activeFormat.signerTitle,
          issueDate: todayIso(),
          verifyUrl,
          letterheadPdfBytes,
        });

        const blob = new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });
        const letterHash = await sha256Hex(blob);
        const blobUrl = URL.createObjectURL(blob);
        const fileName = `service-letter-${i + 1}-${slug(empName)}.pdf`;

        generated.push({
          letterId,
          rowIndex: i + 1,
          employeeName: empName,
          nic,
          position,
          startDate,
          endDate,
          stillEmployed,
          extraValues,
          renderedBody,
          fileName,
          blob,
          blobUrl,
          letterHash,
          verifyUrl,
          onChainStatus: "draft",
        });
      }

      setBulkItems(generated);
      setBulkMessage(
        `Successfully generated ${generated.length} service letter PDFs from "${file.name}".`
      );
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Failed to process Excel file.");
    } finally {
      setGeneratingBulk(false);
      e.target.value = "";
    }
  };

  const handleDeleteBulkItem = (letterId: string) => {
    setBulkItems((prev) => {
      const target = prev.find((item) => item.letterId === letterId);
      if (target) URL.revokeObjectURL(target.blobUrl);
      return prev.filter((item) => item.letterId !== letterId);
    });
    if (previewItem?.letterId === letterId) {
      setPreviewItem(null);
    }
  };

  const handleDownloadAllZip = async () => {
    if (bulkItems.length === 0) return;
    setZipDownloading(true);
    try {
      const zip = new JSZip();
      for (const item of bulkItems) {
        zip.file(item.fileName, item.blob);
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `service-letters-bulk-${todayIso()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setZipDownloading(false);
    }
  };

  async function waitForServerConfirmation(
    item: GeneratedBulkItem,
    txHash: string,
    formatIdUsed: string
  ) {
    for (let attempt = 0; attempt < POLL_MAX_TRIES; attempt++) {
      const res = await authFetch("/api/issue", {
        letterId: item.letterId,
        letterHash: item.letterHash,
        txHash,
        employeeName: item.employeeName,
        position: item.position,
        formatId: formatIdUsed,
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 200 && data.status === "issued") {
        return;
      }
      if (res.status !== 202) {
        throw new Error(data.error ?? "Server could not verify transaction.");
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    throw new Error("Confirmation timed out. Please check again shortly.");
  }

  const handleIssueAllOnChain = async () => {
    if (!activeFormat) return;
    const pendingItems = bulkItems.filter((item) => item.onChainStatus !== "issued");
    if (pendingItems.length === 0) return;

    setBulkError("");
    setBulkMessage("");
    setIssuingAllOnChain(true);

    const pendingIds = new Set(pendingItems.map((i) => i.letterId));
    setBulkItems((prev) =>
      prev.map((x) =>
        pendingIds.has(x.letterId)
          ? { ...x, onChainStatus: "issuing", errorText: undefined }
          : x
      )
    );

    try {
      const { wallet } = await getFreshLaceWallet();
      const { issueBulkLettersOnChain } = await import("@/lib/letter-tx");

      const { txHash } = await issueBulkLettersOnChain(
        wallet,
        pendingItems.map((item) => item.letterHash)
      );

      await Promise.all(
        pendingItems.map(async (item) => {
          try {
            await waitForServerConfirmation(item, txHash, activeFormat.id);
            setBulkItems((prev) =>
              prev.map((x) =>
                x.letterId === item.letterId
                  ? { ...x, onChainStatus: "issued", txHash }
                  : x
              )
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Confirmation failed";
            setBulkItems((prev) =>
              prev.map((x) =>
                x.letterId === item.letterId
                  ? { ...x, onChainStatus: "error", errorText: msg }
                  : x
              )
            );
          }
        })
      );

      setBulkMessage(
        `All ${pendingItems.length} service letters recorded on Cardano in one transaction!`
      );
      await onRefreshDashboard();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      const cleanMsg = /declin|reject|cancel|denied/i.test(msg)
        ? "You cancelled the request in Lace. Nothing was sent."
        : /insufficient|utxo|balance/i.test(msg)
        ? `Not enough test ADA in this wallet (needs ~${pendingItems.length * 2 + 1} test ADA).`
        : msg;

      setBulkError(cleanMsg);
      setBulkItems((prev) =>
        prev.map((x) =>
          pendingIds.has(x.letterId)
            ? { ...x, onChainStatus: "draft", errorText: undefined }
            : x
        )
      );
    } finally {
      setIssuingAllOnChain(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* STEP 1: SELECT FORMAT, LETTERHEAD & CUSTOM EXTRA FIELDS */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">
            1. Choose Format, Letterhead &amp; Extra Fields (Optional)
          </CardTitle>
          <CardDescription>
            Select a ready format, company letterhead, and any extra columns you want included in the Excel template.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bulkFormat">Ready Letter Format *</Label>
              <select
                id="bulkFormat"
                value={activeFormat?.id ?? ""}
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
              <Label htmlFor="bulkLetterhead">Company Letterhead</Label>
              <select
                id="bulkLetterhead"
                value={activeLetterhead?.id ?? "none"}
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

          <Separator />

          {/* Extra Custom Fields Builder */}
          <div className="space-y-3">
            <div>
              <Label className="text-sm font-semibold text-slate-800">
                Extra Custom Fields (Added to Excel Template &amp; Letters)
              </Label>
              <p className="text-xs text-slate-500 mt-0.5">
                Standard columns are <code>employee_name</code>, <code>nic</code>,{" "}
                <code>position</code>, <code>start_date</code>, <code>end_date</code>, and{" "}
                <code>still_employed</code>. Add extra details below (e.g., Department, Employee ID, Grade):
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 max-w-lg">
              <Input
                placeholder="e.g. Department or Employee ID"
                value={newFieldLabel}
                onChange={(e) => setNewFieldLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddExtraField();
                  }
                }}
              />
              <Button type="button" variant="secondary" onClick={handleAddExtraField}>
                + Add Field
              </Button>
            </div>

            {extraFields.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {extraFields.map((field) => (
                  <Badge
                    key={field.key}
                    variant="outline"
                    className="bg-indigo-50 text-indigo-800 border-indigo-200 px-3 py-1 text-xs flex items-center gap-2"
                  >
                    <span>
                      {field.label} (<code>{field.key}</code>)
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveExtraField(field.key)}
                      className="text-indigo-500 hover:text-red-600 font-bold"
                      title="Remove field"
                    >
                      ✕
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={handleDownloadTemplate}
              disabled={!activeFormat}
              className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
            >
              ↓ Download Excel Template (.xlsx)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* STEP 2: UPLOAD FILLED EXCEL SHEET */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">2. Upload Filled Excel Sheet</CardTitle>
          <CardDescription>
            Fill the downloaded Excel template with employee rows and upload it here to generate all PDFs at once.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={generatingBulk || !activeFormat}
              onChange={handleExcelUpload}
              className="max-w-md cursor-pointer"
            />
            {excelFileName && (
              <span className="text-xs text-slate-500">
                Loaded file: <strong>{excelFileName}</strong>
              </span>
            )}
          </div>

          {generatingBulk && (
            <p className="text-sm text-indigo-700 font-medium">
              Generating PDFs with QR codes for all rows...
            </p>
          )}

          {bulkMessage && (
            <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              {bulkMessage}
            </p>
          )}

          {bulkError && (
            <p
              className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
              role="alert"
            >
              {bulkError}
            </p>
          )}
        </CardContent>
      </Card>

      {/* STEP 3: GENERATED BULK LETTERS LIST */}
      {bulkItems.length > 0 && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg">
                3. Generated Service Letters ({bulkItems.length})
              </CardTitle>
              <CardDescription>
                Preview, download individually, delete unwanted rows, download all as a ZIP, or record all on Cardano with a single approval.
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={zipDownloading}
                onClick={handleDownloadAllZip}
                className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
              >
                {zipDownloading
                  ? "Creating ZIP..."
                  : `Download All (${bulkItems.length} PDFs)`}
              </Button>

              {!walletAddress ? (
                <Button
                  type="button"
                  onClick={onConnectWallet}
                  disabled={connecting}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  {connecting ? "Connecting..." : "Connect Lace to Record on Cardano"}
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={
                    issuingAllOnChain ||
                    bulkItems.every((i) => i.onChainStatus === "issued")
                  }
                  onClick={handleIssueAllOnChain}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {issuingAllOnChain
                    ? "Approve in Lace / Confirming..."
                    : "Record All on Cardano (1 Approval)"}
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {connectError && (
              <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
                {connectError}
              </p>
            )}

            <div className="overflow-x-auto border rounded-xl">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="border-b bg-slate-100/80 text-slate-600 text-xs uppercase">
                    <th className="py-3 px-4 font-semibold">#</th>
                    <th className="py-3 px-4 font-semibold">Employee &amp; NIC</th>
                    <th className="py-3 px-4 font-semibold">Position &amp; Dates</th>
                    <th className="py-3 px-4 font-semibold">Cardano Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {bulkItems.map((item) => (
                    <tr key={item.letterId} className="hover:bg-slate-50">
                      <td className="py-3 px-4 text-xs text-slate-500">{item.rowIndex}</td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">
                          {item.employeeName}
                        </div>
                        <div className="text-xs text-slate-500">
                          {item.nic ? `NIC: ${item.nic}` : "No NIC"}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-800">{item.position}</div>
                        <div className="text-xs text-slate-500">
                          {item.startDate} →{" "}
                          {item.stillEmployed ? "Present" : item.endDate || "Today"}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {item.onChainStatus === "issued" ? (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">
                            Recorded on Cardano
                          </Badge>
                        ) : item.onChainStatus === "issuing" ? (
                          <Badge className="bg-indigo-100 text-indigo-800 border-indigo-300">
                            Signing / Confirming...
                          </Badge>
                        ) : item.onChainStatus === "error" ? (
                          <div>
                            <Badge className="bg-red-100 text-red-800 border-red-300">
                              Failed
                            </Badge>
                            {item.errorText && (
                              <p className="text-[11px] text-red-600 mt-0.5 max-w-[180px]">
                                {item.errorText}
                              </p>
                            )}
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-slate-600">
                            PDF Ready
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setPreviewItem(item)}
                        >
                          Preview
                        </Button>
                        <a
                          href={item.blobUrl}
                          download={item.fileName}
                          className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
                        >
                          Download
                        </a>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={issuingAllOnChain}
                          onClick={() => handleDeleteBulkItem(item.letterId)}
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* PDF & LETTER PREVIEW MODAL */}
      {previewItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden border">
            <div className="px-6 py-4 border-b flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Preview: {previewItem.employeeName}
                </h3>
                <p className="text-xs text-slate-500">
                  {previewItem.position} • SHA-256: {previewItem.letterHash.slice(0, 16)}...
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setPreviewItem(null)}>
                ✕ Close
              </Button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto bg-slate-100">
              <iframe
                src={previewItem.blobUrl}
                title={`Preview ${previewItem.employeeName}`}
                className="w-full h-[480px] rounded-lg border bg-white"
              />
            </div>

            <div className="px-6 py-3 border-t bg-slate-50 flex items-center justify-between">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => handleDeleteBulkItem(previewItem.letterId)}
              >
                Delete Letter
              </Button>
              <div className="flex gap-2">
                <a
                  href={previewItem.blobUrl}
                  download={previewItem.fileName}
                  className="inline-flex h-8 items-center justify-center rounded-md bg-indigo-600 px-4 text-xs font-medium text-white hover:bg-indigo-700"
                >
                  Download PDF
                </a>
                <Button variant="outline" size="sm" onClick={() => setPreviewItem(null)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}