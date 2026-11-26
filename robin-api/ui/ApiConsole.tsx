"use client";

import { useState } from "react";
import { useCompany } from "@/components/dashboard/CompanyProvider";
import ApiKeysPanel from "@/robin-api/ui/ApiKeysPanel";
import UsagePanel from "@/robin-api/ui/UsagePanel";
import QuickStartPanel from "@/robin-api/ui/QuickStartPanel";
import PlaygroundPanel from "@/robin-api/ui/PlaygroundPanel";

const TABS = [
  { id: "keys", label: "API Keys" },
  { id: "start", label: "Quick start" },
  { id: "playground", label: "Playground" },
  { id: "usage", label: "Usage" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** The whole "API" page of the company dashboard */
export default function ApiConsole() {
  const { me } = useCompany();
  const [tab, setTab] = useState<TabId>("keys");

  if (!me) return null;
  // Team accounts only see the "not allowed" message from the keys panel
  if (me.role === "team") return <ApiKeysPanel />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === t.id ? "bg-indigo-600 text-white" : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "keys" && <ApiKeysPanel />}
      {tab === "start" && <QuickStartPanel />}
      {tab === "playground" && <PlaygroundPanel />}
      {tab === "usage" && <UsagePanel />}
    </div>
  );
}
