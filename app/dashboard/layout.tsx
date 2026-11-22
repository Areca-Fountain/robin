"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import RoleGate from "@/components/auth/RoleGate";
import CompanyProvider, { useCompany } from "@/components/dashboard/CompanyProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/dashboard", label: "Analytics", owner: false },
  { href: "/dashboard/issue", label: "Issue Service Letter", owner: false },
  { href: "/dashboard/formats", label: "Manage Formats", owner: false },
  { href: "/dashboard/team", label: "Assign Team", owner: true },
  { href: "/dashboard/verification", label: "Account Verification", owner: false },
  { href: "/dashboard/subscription", label: "Subscription & Plan", owner: true },
  { href: "/dashboard/settings", label: "Account Settings", owner: true },
  { href: "/dashboard/revoke", label: "Revoke Letter", owner: false },
];

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { me, loading, error, signOut } = useCompany();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-500" role="status">Loading your company…</p>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md space-y-4 text-center">
          <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {error || "Could not load your company."}
          </p>
          <Button variant="outline" onClick={() => void signOut()}>
            Sign out and try another account
          </Button>
        </div>
      </div>
    );
  }

  const items = NAV.filter((n) => !n.owner || me.role !== "team");

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      <aside className="border-b border-slate-200 bg-white p-4 md:w-64 md:shrink-0 md:border-b-0 md:border-r">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Robin</p>
          <p className="mt-1 font-semibold text-slate-900 break-words">{me.company.name}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge
              className={me.company.verified ? "bg-emerald-600 text-white" : "bg-slate-500 text-white"}
            >
              {me.company.verified ? "Verified" : "Not verified"}
            </Badge>
            <Badge
              variant="outline"
              className={
                me.company.subscriptionPlan === "Premium"
                  ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                  : "border-slate-300 text-slate-600"
              }
            >
              {me.company.subscriptionPlan}
            </Badge>
            <span className="text-xs capitalize text-slate-500">{me.role}</span>
          </div>
          <p className="mt-2 break-all text-xs text-slate-500">{me.email}</p>
          {me.company.subscriptionPlan === "Free" && (
            <p className="mt-2 rounded-md bg-slate-100 px-2.5 py-1.5 text-[11px] text-slate-600">
              Free quota: <strong>{me.stats.letters} / 5</strong> letters issued
            </p>
          )}
        </div>

        <nav className="flex flex-wrap gap-1 md:flex-col">
          {items.map((item) => {
            const active =
              item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  active ? "bg-indigo-50 text-indigo-700" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <Button variant="outline" size="sm" className="mt-4" onClick={() => void signOut()}>
          Sign out
        </Button>
      </aside>

      <main className="flex-1 p-4 sm:p-8">
        <div className="mx-auto w-full max-w-3xl">{children}</div>
      </main>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate role="company">
      <CompanyProvider>
        <Shell>{children}</Shell>
      </CompanyProvider>
    </RoleGate>
  );
}