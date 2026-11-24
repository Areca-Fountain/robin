"use client";

import Link from "next/link";
import { useCompany } from "@/components/dashboard/CompanyProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PrivateOverview } from "@/components/dashboard/PrivateLettersCard";

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function AnalyticsPage() {
  const { me } = useCompany();
  if (!me) return null;

  const cards = [
    { label: "Letters issued", value: me.stats.letters },
    { label: "Issued this month", value: me.stats.lettersThisMonth },
    { label: "Ready formats", value: me.stats.generatedFormats },
    { label: "Team members", value: me.stats.teamMembers },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
        <p className="mt-1 text-slate-600">An overview of {me.company.name}.</p>
      </div>

      {!me.company.verified && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your company is <strong>{me.company.status.toLowerCase()}</strong>. You can already
          issue letters, but anyone who scans them will see &quot;Not verified&quot; until
          Robin&apos;s team approves the company.{" "}
          <Link href="/dashboard/verification" className="underline">
            See status
          </Link>
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="border-slate-200 shadow-sm">
            <CardContent className="pt-4">
              <p className="text-3xl font-bold text-slate-900">{c.value}</p>
              <p className="mt-1 text-xs text-slate-500">{c.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <PrivateOverview />

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Employee history</CardTitle>
        </CardHeader>
        <CardContent>
          {me.recent.length === 0 ? (
            <p className="text-sm text-slate-500">
              No letters yet.{" "}
              <Link href="/dashboard/issue" className="text-indigo-700 underline">
                Issue the first one
              </Link>
              .
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pr-4">Employee</th>
                    <th className="py-2 pr-4">Position</th>
                    <th className="py-2 pr-4">Issued</th>
                    <th className="py-2">Check</th>
                  </tr>
                </thead>
                <tbody>
                  {me.recent.map((l) => (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className="py-2 pr-4 font-medium text-slate-900">{l.employeeName}</td>
                      <td className="py-2 pr-4 text-slate-600">{l.position ?? "-"}</td>
                      <td className="py-2 pr-4 text-slate-600">{formatDate(l.issuedAt)}</td>
                      <td className="py-2">
                        <a
                          href={`/verify/${l.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-700 underline"
                        >
                          Verify
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}