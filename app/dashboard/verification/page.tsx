"use client";

import { useState } from "react";
import { useCompany } from "@/components/dashboard/CompanyProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function VerificationPage() {
  const { me, refresh } = useCompany();
  const [checking, setChecking] = useState(false);
  if (!me) return null;

  const { status, verified } = me.company;

  async function handleRefresh() {
    setChecking(true);
    await refresh();
    setChecking(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Account Verification</h1>
        <p className="mt-1 text-slate-600">
          Robin&apos;s team checks your business registration and documents.
        </p>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Status of {me.company.name}</CardTitle>
          <CardDescription>
            Anyone who scans one of your letters sees this status next to your company name.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Badge className={verified ? "bg-emerald-600 text-white" : "bg-slate-500 text-white"}>
              {verified ? "Verified" : "Not verified"}
            </Badge>
            <span className="text-sm text-slate-600">Application status: {status}</span>
          </div>

          {verified ? (
            <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              Your company is verified. Scanners will see a green &quot;Verified&quot; label.
            </p>
          ) : status === "Rejected" ? (
            <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
              Your application was not approved. Contact Robin&apos;s team to resubmit your
              documents.
            </p>
          ) : (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Your application is pending. You can already issue letters, but scanners will see
              &quot;Not verified&quot; until Robin&apos;s team approves it.
            </p>
          )}

          <Button variant="outline" onClick={() => void handleRefresh()} disabled={checking}>
            {checking ? "Checking…" : "Refresh status"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}