"use client";

export type VerifyStatus = "valid" | "revoked" | "tampered" | "not_found";

export interface VerifyResponse {
  status: VerifyStatus;
  message: string;
  letter?: {
    companyName: string;
    employeeName: string;
    position: string | null;
    issuedAt: string;
    /** true when Robin's team has verified the issuing company */
    companyVerified?: boolean;
  };
  txHash?: string;
}

const STATUS_STYLES: Record<
  VerifyStatus,
  { title: string; symbol: string; box: string; badge: string }
> = {
  valid: {
    title: "Valid letter",
    symbol: "✓",
    box: "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40",
    badge: "bg-emerald-600 text-white",
  },
  revoked: {
    title: "Revoked letter",
    symbol: "!",
    box: "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40",
    badge: "bg-amber-600 text-white",
  },
  tampered: {
    title: "Tampered or mismatched",
    symbol: "✕",
    box: "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40",
    badge: "bg-red-600 text-white",
  },
  not_found: {
    title: "Not found",
    symbol: "?",
    box: "border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900",
    badge: "bg-zinc-600 text-white",
  },
};

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function VerifyResult({ result }: { result: VerifyResponse }) {
  const style = STATUS_STYLES[result.status];

  return (
    <div
      className={`rounded-xl border p-5 ${style.box}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg font-semibold ${style.badge}`}
          aria-hidden="true"
        >
          {style.symbol}
        </span>
        <div>
          <h2 className="text-lg font-semibold">{style.title}</h2>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
            {result.message}
          </p>
        </div>
      </div>

      {result.letter && (
        <dl className="mt-5 grid grid-cols-[auto,1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-zinc-500">Company</dt>
          <dd className="font-medium">{result.letter.companyName}</dd>

          {result.letter.companyVerified !== undefined && (
            <>
              <dt className="text-zinc-500">Company status</dt>
              <dd>
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                    result.letter.companyVerified
                      ? "bg-emerald-600 text-white"
                      : "bg-zinc-500 text-white"
                  }`}
                >
                  {result.letter.companyVerified ? "Verified" : "Not verified"}
                </span>
              </dd>
            </>
          )}

          <dt className="text-zinc-500">Employee</dt>
          <dd className="font-medium">{result.letter.employeeName}</dd>

          {result.letter.position && (
            <>
              <dt className="text-zinc-500">Position</dt>
              <dd className="font-medium">{result.letter.position}</dd>
            </>
          )}

          <dt className="text-zinc-500">Issued</dt>
          <dd className="font-medium">{formatDate(result.letter.issuedAt)}</dd>

          {result.txHash && (
            <>
              <dt className="text-zinc-500">Blockchain record</dt>
              <dd className="break-all">
                <a
                  href={`https://preprod.cardanoscan.io/transaction/${result.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs underline underline-offset-2"
                >
                  {result.txHash}
                </a>
              </dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}