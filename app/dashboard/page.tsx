"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCompany } from "@/components/dashboard/CompanyProvider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { walletKey } from "@/lib/wallet-key";

interface TeamMember {
  id: string;
  email: string;
  role: "secondary" | "team";
  createdAt: string;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function AnalyticsPage() {
  const { me, authFetch, refresh } = useCompany();

  // Employee History Search & Revoke states
  const [searchQuery, setSearchQuery] = useState("");
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeMessage, setRevokeMessage] = useState("");
  const [revokeError, setRevokeError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Team Members states
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [addingMember, setAddingMember] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [teamBusy, setTeamBusy] = useState(false);
  const [teamMessage, setTeamMessage] = useState("");
  const [teamError, setTeamError] = useState("");

  const canManageTeam = me?.role === "primary" || me?.role === "secondary";

  const loadTeamMembers = useCallback(async () => {
    try {
      const res = await authFetch("/api/team", { action: "list" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.members)) {
        setMembers(
          (data.members as TeamMember[]).filter((m) => m.role === "team")
        );
      }
    } catch {
      // ignore
    } finally {
      setTeamLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    let active = true;
    async function init() {
      if (!active || !canManageTeam) return;
      await loadTeamMembers();
    }
    void init();
    return () => {
      active = false;
    };
  }, [canManageTeam, loadTeamMembers]);

  const filteredHistory = useMemo(() => {
    const list = me?.recent ?? [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (item) =>
        item.employeeName.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q)
    );
  }, [me?.recent, searchQuery]);

  async function handleCopyLetterId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1800);
    } catch {
      // ignore clipboard errors
    }
  }

  async function handleRevokeFromRow(letterId: string, employeeName: string) {
    if (!me) return;
    if (
      !window.confirm(
        `Revoke the service letter for "${employeeName}" (${letterId})?\n\nThis spends the letter's record in the Robin contract and cannot be undone.`
      )
    ) {
      return;
    }

    setRevokeError("");
    setRevokeMessage("");
    setRevokingId(letterId);

    try {
      // 1. Find the letter's registry UTxO
      const res = await fetch(`/api/letters/utxo?letterId=${letterId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not find this letter.");
      if (data.spent) {
        await authFetch("/api/letters/mark-revoked", { letterId });
        await refresh();
        throw new Error("This letter has already been revoked.");
      }

      // 2. Connect company wallet
      const mesh = await import("@meshsdk/core");
      let wallet;
      try {
        wallet = await mesh.BrowserWallet.enable("lace");
      } catch {
        throw new Error("Could not open Lace. Unlock the extension, refresh and try again.");
      }
      if ((await wallet.getNetworkId()) !== 0) {
        throw new Error("Lace is on mainnet. Switch it to the Preprod test network.");
      }

      const address = await wallet.getChangeAddress();
      const connected = walletKey(address);
      const registered = walletKey(me.company.walletAddress);
      if (!connected || !registered || connected !== registered) {
        throw new Error("This is not your company's registered wallet. Switch wallets in Lace.");
      }

      // 3. Sign & send revoke tx on-chain
      const { revokeLetterOnChain } = await import("@/lib/letter-tx");
      await revokeLetterOnChain(wallet, {
        txHash: data.txHash,
        outputIndex: data.outputIndex,
        amount: data.amount,
      });

      // 4. Mark revoked in DB and refresh dashboard
      await authFetch("/api/letters/mark-revoked", { letterId });
      setRevokeMessage(
        `Revoke transaction sent for ${employeeName}. It shows as revoked on Cardano within a minute.`
      );
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/declin|reject|cancel|denied/i.test(message)) {
        setRevokeError("You cancelled the request in Lace. Nothing was sent.");
      } else {
        setRevokeError(message);
      }
    } finally {
      setRevokingId(null);
    }
  }

  async function handleAddTeamMember(e: React.FormEvent) {
    e.preventDefault();
    const email = newMemberEmail.trim().toLowerCase();
    if (!email) return;

    setTeamError("");
    setTeamMessage("");
    setTeamBusy(true);

    try {
      const res = await authFetch("/api/team", {
        action: "add",
        email,
        role: "team",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not add team member.");

      setNewMemberEmail("");
      setAddingMember(false);
      setTeamMessage(`Added ${email} to your team.`);
      await loadTeamMembers();
      await refresh();
    } catch (err) {
      setTeamError(err instanceof Error ? err.message : "Failed to add team member.");
    } finally {
      setTeamBusy(false);
    }
  }

  async function handleRemoveTeamMember(member: TeamMember) {
    if (!window.confirm(`Remove ${member.email} from your team?`)) return;

    setTeamError("");
    setTeamMessage("");
    setTeamBusy(true);

    try {
      const res = await authFetch("/api/team", {
        action: "remove",
        id: member.id,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not remove team member.");

      setTeamMessage(`Removed ${member.email} from your team.`);
      await loadTeamMembers();
      await refresh();
    } catch (err) {
      setTeamError(err instanceof Error ? err.message : "Failed to remove team member.");
    } finally {
      setTeamBusy(false);
    }
  }

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

      {/* EMPLOYEE HISTORY SECTION */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg">Employee history</CardTitle>
            <CardDescription>
              Search by employee name or unique letter ID, view work status, verify, or revoke letters.
            </CardDescription>
          </div>
          {me.recent.length > 0 && (
            <div className="w-full sm:w-72">
              <Input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or Letter ID…"
                className="h-9 bg-white"
              />
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {revokeMessage && (
            <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              {revokeMessage}
            </p>
          )}
          {revokeError && (
            <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
              {revokeError}
            </p>
          )}

          {me.recent.length === 0 ? (
            <p className="text-sm text-slate-500">
              No letters yet.{" "}
              <Link href="/dashboard/issue" className="text-indigo-700 underline">
                Issue the first one
              </Link>
              .
            </p>
          ) : filteredHistory.length === 0 ? (
            <p className="text-sm text-slate-500">
              No matching records found for &quot;{searchQuery}&quot;.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pr-4">Letter ID</th>
                    <th className="py-2 pr-4">Employee</th>
                    <th className="py-2 pr-4">Position</th>
                    <th className="py-2 pr-4">Work Status</th>
                    <th className="py-2 pr-4">Issued</th>
                    <th className="py-2 pr-4">Check</th>
                    <th className="py-2 text-right">Cancel</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((l) => (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className="py-2.5 pr-4 font-mono text-xs text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <span title={l.id}>{l.id.slice(0, 8)}…</span>
                          <button
                            type="button"
                            onClick={() => void handleCopyLetterId(l.id)}
                            className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-sans text-slate-600 hover:bg-slate-100"
                            title="Copy full Letter ID"
                          >
                            {copiedId === l.id ? "Copied" : "Copy"}
                          </button>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 font-medium text-slate-900">{l.employeeName}</td>
                      <td className="py-2.5 pr-4 text-slate-600">{l.position ?? "-"}</td>
                      <td className="py-2.5 pr-4">
                        {l.workStatus === "active" ? (
                          <Badge className="border-emerald-300 bg-emerald-100 text-emerald-800">
                            Active
                          </Badge>
                        ) : l.workStatus === "resigned" ? (
                          <Badge className="border-slate-300 bg-slate-100 text-slate-700">
                            Resigned
                          </Badge>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-600">{formatDate(l.issuedAt)}</td>
                      <td className="py-2.5 pr-4">
                        <a
                          href={`/verify/${l.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-700 underline"
                        >
                          Verify
                        </a>
                      </td>
                      <td className="py-2.5 text-right">
                        {l.revokedAt ? (
                          <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                            Revoked
                          </Badge>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={revokingId !== null}
                            onClick={() => void handleRevokeFromRow(l.id, l.employeeName)}
                            className="h-7 px-2.5 text-xs"
                          >
                            {revokingId === l.id ? "Revoking…" : "Revoke"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* TEAM MEMBERS SECTION */}
      {canManageTeam && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Team Members</CardTitle>
              <CardDescription>
                Add team members by email so they can issue service letters for {me.company.name}.
              </CardDescription>
            </div>
            {!addingMember && (
              <Button
                type="button"
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700"
                disabled={teamBusy}
                onClick={() => {
                  setTeamError("");
                  setTeamMessage("");
                  setAddingMember(true);
                }}
              >
                + Add
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {teamMessage && (
              <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                {teamMessage}
              </p>
            )}
            {teamError && (
              <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
                {teamError}
              </p>
            )}

            {addingMember && (
              <form
                onSubmit={handleAddTeamMember}
                className="flex flex-col gap-2 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 sm:flex-row sm:items-center"
              >
                <Input
                  type="email"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  placeholder="Enter team member email (e.g. hr@company.com)"
                  disabled={teamBusy}
                  required
                  className="bg-white sm:max-w-md"
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={teamBusy || !newMemberEmail.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    {teamBusy ? "Adding…" : "Add Member"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={teamBusy}
                    onClick={() => {
                      setAddingMember(false);
                      setNewMemberEmail("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}

            {teamLoading ? (
              <p className="text-sm text-slate-500">Loading team members…</p>
            ) : members.length === 0 ? (
              <p className="text-sm text-slate-500">
                No team members added yet. Click <strong>+ Add</strong> to invite a member by email.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500">
                    <tr>
                      <th className="py-2 pr-4">Email</th>
                      <th className="py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.id} className="border-t border-slate-100">
                        <td className="py-2.5 pr-4 font-medium text-slate-900">{m.email}</td>
                        <td className="py-2.5 text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={teamBusy}
                            onClick={() => void handleRemoveTeamMember(m)}
                            className="h-7 px-2.5 text-xs"
                          >
                            Remove
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}