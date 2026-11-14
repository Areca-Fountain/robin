"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { sha256Hex } from "@/lib/hash";
import VerifyResult, { type VerifyResponse } from "@/components/VerifyResult";

export default function VerifyLetterPage() {
  const { letterID } = useParams<{ letterID: string }>();
  const inputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function runVerification(hash?: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ letterId: letterID, hash }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Verification failed. Please try again.");
        setResult(null);
      } else {
        setResult(data as VerifyResponse);
      }
    } catch {
      setError("Something went wrong while checking this letter. Please try again.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  // Verify automatically when the QR link is opened
  useEffect(() => {
    if (letterID) void runVerification();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letterID]);

  // Optional: check that a PDF in hand is the same one that was issued
  async function handleFile(file: File) {
    setFileName(file.name);
    const hash = await sha256Hex(file);
    await runVerification(hash);
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">
        Service letter check
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        This result comes from the record stored on the Cardano blockchain.
      </p>

      <div className="mt-8">
        {loading && !result && (
          <p className="text-sm text-zinc-500" role="status">
            Checking the blockchain…
          </p>
        )}

        {error && (
          <p
            className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
            role="alert"
          >
            {error}
          </p>
        )}

        {result && <VerifyResult result={result} />}
      </div>

      <section className="mt-10 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <h2 className="font-medium">Have the PDF in front of you?</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Upload it to confirm the file is the same one the company issued.
          It stays on your device.
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="mt-3 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          {loading ? "Checking…" : "Choose the PDF"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = "";
          }}
        />
        {fileName && (
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            Checked: {fileName}
          </p>
        )}
      </section>
    </main>
  );
}