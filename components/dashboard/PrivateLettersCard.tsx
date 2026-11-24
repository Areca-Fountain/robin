"use client";

// Small building blocks that connect the Midnight "private letters" feature to the
// rest of the company dashboard (analytics, issue page, settings, revoke page).

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCompany } from "@/components/dashboard/CompanyProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface IssuerRow {
  company_id: string;
  issuer_id: string;
  status: "pending" | "registered" | "removed";
}

interface PrivateLetter {
  id: string;
  midnight_tx: string | null;
  issued_at: string;
  revoked: boolean;
  note: string | null;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function statusInfo(issuer: IssuerRow | null) {
  if (!issuer) return { label: "Not set up", className: "bg-slate-500 text-white" };
  if (issuer.status === "registered") return { label: "Active", className: "bg-emerald-600 text-white" };
  if (issuer.status === "removed") return { label: "Removed", className: "bg-red-600 text-white" };
  return { label: "Waiting for Robin admin", className: "bg-amber-500 text-white" };
}

function usePrivateData(withLetters: boolean) {
  const { authFetch } = useCompany();
  const [issuer, setIssuer] = useState<IssuerRow | null>(null);
  const [letters, setLetters] = useState<PrivateLetter[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [issuerRes, lettersRes] = await Promise.all([
          authFetch("/api/midnight/issuers", { action: "status" }),
          withLetters ? authFetch("/api/midnight/letters", { action: "list" }) : Promise.resolve(null),
        ]);
        const issuerJson = await issuerRes.json().catch(() => ({}));
        const lettersJson = lettersRes ? await lettersRes.json().catch(() => ({})) : {};
        if (!active) return;
        if (!issuerRes.ok) throw new Error("issuer status failed");
        setIssuer((issuerJson.issuer as IssuerRow) ?? null);
        if (lettersRes?.ok) setLetters((lettersJson.letters as PrivateLetter[]) ?? []);
      } catch {
        if (active) setFailed(true);
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [authFetch, withLetters]);

  return { issuer, letters, loaded, failed };
}

/** Analytics page: counts and the latest private letters. */
export function PrivateOverview() {
  const { issuer, letters, loaded, failed } = usePrivateData(true);
  const status = statusInfo(issuer);
  const active = letters.filter((l) => !l.revoked).length;
  const revoked = letters.length - active;

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg">Private letters (Midnight)</CardTitle>
          {loaded && !failed && <Badge className={status.className}>{status.label}</Badge>}
        </div>
        <CardDescription>
          Letters whose details stay with the employee. Only a hash is published.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!loaded && <p className="text-sm text-slate-500">Loading...</p>}
        {loaded && failed && (
          <p className="text-sm text-slate-500">Private letter data could not be loaded right now.</p>
        )}

        {loaded && !failed && !issuer && (
          <p className="text-sm text-slate-600">
            Private letters are not set up for this company yet. Create an issuer key and send it to
            Robin for registration.
          </p>
        )}

        {loaded && !failed && issuer && (
          <>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-slate-50 px-2 py-3">
                <p className="text-2xl font-bold text-slate-900">{letters.length}</p>
                <p className="text-xs text-slate-500">Issued</p>
              </div>
              <div className="rounded-lg bg-slate-50 px-2 py-3">
                <p className="text-2xl font-bold text-slate-900">{active}</p>
                <p className="text-xs text-slate-500">Active</p>
              </div>
              <div className="rounded-lg bg-slate-50 px-2 py-3">
                <p className="text-2xl font-bold text-slate-900">{revoked}</p>
                <p className="text-xs text-slate-500">Revoked</p>
              </div>
            </div>

            {letters.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500">
                    <tr>
                      <th className="py-2 pr-4">Issued</th>
                      <th className="py-2 pr-4">Reference</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {letters.slice(0, 5).map((l) => (
                      <tr key={l.id} className="border-t border-slate-100">
                        <td className="py-2 pr-4 text-slate-600">{formatDate(l.issued_at)}</td>
                        <td className="py-2 pr-4 text-slate-900">{l.note ?? "-"}</td>
                        <td className="py-2">
                          <Badge
                            className={l.revoked ? "bg-red-600 text-white" : "bg-emerald-600 text-white"}
                          >
                            {l.revoked ? "Revoked" : "Active"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        <Link href="/dashboard/private">
          <Button variant="outline">
            {issuer ? "Open Private Letters" : "Set up private letters"}
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

/**
 * A short card for other pages.
 *  - "issue":    offers a private letter next to the normal letter form
 *  - "settings": shows the issuer key status
 *  - "revoke":   explains where private letters are revoked
 */
export function PrivateLettersPromo({ variant }: { variant: "issue" | "settings" | "revoke" }) {
  const { issuer, loaded, failed } = usePrivateData(false);
  const status = statusInfo(issuer);

  const title =
    variant === "settings"
      ? "Private letters key"
      : variant === "revoke"
        ? "Revoking a private letter?"
        : "Prefer privacy for your employee?";

  const body =
    variant === "settings"
      ? "Your private issuer key lives only in the browser you created it in. Keep the backup file safe: without it your company cannot issue or revoke private letters."
      : variant === "revoke"
        ? "This page revokes standard (Cardano) letters. Private letters are revoked from the Private Letters page."
        : "A private letter publishes only a hash on Midnight. The employee keeps the details and later proves one fact (employment, tenure or position) without sharing the letter.";

  const button =
    variant === "settings"
      ? "Manage key"
      : variant === "revoke"
        ? "Go to Private Letters"
        : "Issue a private letter";

  return (
    <Card className="border-indigo-200 bg-indigo-50/50 shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg">{title}</CardTitle>
          {variant !== "revoke" && loaded && !failed && (
            <Badge className={status.className}>{status.label}</Badge>
          )}
        </div>
        <CardDescription className="text-slate-700">{body}</CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/dashboard/private">
          <Button variant="outline">{button}</Button>
        </Link>
      </CardContent>
    </Card>
  );
}