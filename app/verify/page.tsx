"use client";

import { useRef, useState, type DragEvent } from "react";
import { sha256Hex } from "@/lib/hash";
import VerifyResult, { type VerifyResponse } from "@/components/VerifyResult";

export default function VerifyPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    setLoading(true);
    setFileName(file.name);

    try {
      // The PDF is hashed in the browser. Only the hash is sent to the server.
      const fileHash = await sha256Hex(file);
      setHash(fileHash);

      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hash: fileHash }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Verification failed. Please try again.");
      } else {
        setResult(data as VerifyResponse);
      }
    } catch {
      setError("Something went wrong while checking the file. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">
        Verify a service letter
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Upload the PDF you received. We compare its fingerprint with the record
        on the Cardano blockchain. The file stays on your device.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`mt-8 flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragging
            ? "border-zinc-900 bg-zinc-100 dark:border-zinc-100 dark:bg-zinc-900"
            : "border-zinc-300 dark:border-zinc-700"
        }`}
      >
        <p className="font-medium">Drop the PDF here</p>
        <p className="mt-1 text-sm text-zinc-500">or</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="mt-3 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {loading ? "Checking…" : "Choose a file"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = ""; // allow re-selecting the same file
          }}
        />
        {fileName && (
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
            {fileName}
          </p>
        )}
      </div>

      {hash && (
        <p className="mt-3 break-all font-mono text-xs text-zinc-500">
          SHA-256: {hash}
        </p>
      )}

      {error && (
        <p
          className="mt-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {error}
        </p>
      )}

      {result && (
        <div className="mt-6">
          <VerifyResult result={result} />
        </div>
      )}
    <p className="mt-8 text-center text-sm text-zinc-500">Need to verify a fact without seeing the letter? <a href="/verify-private" className="underline">Verify privately</a></p>
    </main>
  );
}