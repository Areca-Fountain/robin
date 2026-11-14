"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface CompanyApplication {
  id: string;
  rep_name: string;
  rep_email: string;
  rep_role: string;
  rep_letter_url: string;
  company_name: string;
  br_number: string;
  br_document_url: string;
  kyc_document_url: string;
  wallet_address: string;
  signed_message: string;
  wallet_signature: string;
  status: "Pending" | "Verified" | "Rejected" | string;
  created_at: string;
}

type DocTab = "letter" | "br" | "kyc";

export default function ManageApplicationsPage() {
  const [applications, setApplications] = useState<CompanyApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "Pending" | "Verified" | "Rejected">("ALL");
  const [selectedApp, setSelectedApp] = useState<CompanyApplication | null>(null);
  const [activeDocTab, setActiveDocTab] = useState<DocTab>("br");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Manual refresh handler
  const handleRefresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("company_applications")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setApplications((data as CompanyApplication[]) || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load applications";
      setFeedbackMsg({ type: "error", text: msg });
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial data fetch on mount (React 19 / ESLint compliant)
  useEffect(() => {
    let isMounted = true;

    supabase
      .from("company_applications")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) {
          setFeedbackMsg({ type: "error", text: error.message });
        } else {
          setApplications((data as CompanyApplication[]) || []);
        }
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Approve or Reject Application
  const handleStatusUpdate = async (id: string, newStatus: "Verified" | "Rejected") => {
    setUpdatingId(id);
    setFeedbackMsg(null);
    try {
      const { error } = await supabase
        .from("company_applications")
        .update({ status: newStatus })
        .eq("id", id);

      if (error) throw error;

      setApplications((prev) =>
        prev.map((app) => (app.id === id ? { ...app, status: newStatus } : app))
      );

      if (selectedApp?.id === id) {
        setSelectedApp({ ...selectedApp, status: newStatus });
      }

      setFeedbackMsg({
        type: "success",
        text: `Application status successfully updated to ${newStatus}.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update status";
      setFeedbackMsg({ type: "error", text: msg });
    } finally {
      setUpdatingId(null);
    }
  };

  // Direct file download handler
  const handleDownloadDocument = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  // Filtered applications list
  const filteredApps = applications.filter((app) => {
    const matchesStatus = statusFilter === "ALL" || app.status === statusFilter;
    const matchesQuery =
      app.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.br_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.rep_name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesQuery;
  });

  // Summary counts
  const counts = {
    total: applications.length,
    pending: applications.filter((a) => a.status === "Pending").length,
    verified: applications.filter((a) => a.status === "Verified").length,
    rejected: applications.filter((a) => a.status === "Rejected").length,
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Verified":
        return (
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-100">
            Verified
          </Badge>
        );
      case "Rejected":
        return (
          <Badge className="bg-red-100 text-red-800 border-red-300 hover:bg-red-100">
            Rejected
          </Badge>
        );
      default:
        return (
          <Badge className="bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100">
            Pending
          </Badge>
        );
    }
  };

  const getActiveDocumentInfo = (app: CompanyApplication) => {
    if (activeDocTab === "letter") {
      return {
        title: "Authorization Letter",
        url: app.rep_letter_url,
        fileName: `${app.company_name.replace(/\s+/g, "_")}_Authorization_Letter`,
      };
    }
    if (activeDocTab === "kyc") {
      return {
        title: "KYC Verification Form",
        url: app.kyc_document_url,
        fileName: `${app.company_name.replace(/\s+/g, "_")}_KYC_Form`,
      };
    }
    return {
      title: "Business Registration (BR)",
      url: app.br_document_url,
      fileName: `${app.company_name.replace(/\s+/g, "_")}_BR_Certificate`,
    };
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <Link
              href="/"
              className="text-xs font-semibold uppercase tracking-wider text-indigo-600 hover:text-indigo-500"
            >
              ← Back to Portal
            </Link>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 mt-1">
              Manage Applications
            </h1>
            <p className="text-slate-500 text-sm">
              Review submitted company KYC documents, verify Cardano Lace signatures, and approve or reject applications.
            </p>
          </div>
          <Button variant="outline" onClick={handleRefresh} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh List"}
          </Button>
        </div>

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Submissions</CardDescription>
              <CardTitle className="text-2xl">{counts.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pending Review</CardDescription>
              <CardTitle className="text-2xl text-amber-600">{counts.pending}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Approved / Verified</CardDescription>
              <CardTitle className="text-2xl text-emerald-600">{counts.verified}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Rejected</CardDescription>
              <CardTitle className="text-2xl text-red-600">{counts.rejected}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Feedback Banner */}
        {feedbackMsg && (
          <div
            className={`px-4 py-3 rounded-lg border text-sm ${
              feedbackMsg.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            {feedbackMsg.text}
          </div>
        )}

        {/* Filter & Search Bar */}
        <Card>
          <CardContent className="pt-6 flex flex-col sm:flex-row gap-4 justify-between">
            <Input
              placeholder="Search by company name, BR number, or representative..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="sm:max-w-md"
            />
            <div className="flex flex-wrap gap-2">
              {(["ALL", "Pending", "Verified", "Rejected"] as const).map((status) => (
                <Button
                  key={status}
                  type="button"
                  size="sm"
                  variant={statusFilter === status ? "default" : "outline"}
                  onClick={() => setStatusFilter(status)}
                >
                  {status === "ALL" ? "All" : status}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Applications Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Company Applications ({filteredApps.length})</CardTitle>
            <CardDescription>
              Click Preview to inspect uploaded documents and wallet signature details.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 text-center text-slate-500 text-sm">
                Loading applications from Supabase...
              </div>
            ) : filteredApps.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-sm">
                No company applications found matching your filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="border-b bg-slate-100/80 text-slate-600 text-xs uppercase">
                      <th className="py-3 px-4 font-semibold">Company & BR</th>
                      <th className="py-3 px-4 font-semibold">Representative</th>
                      <th className="py-3 px-4 font-semibold">Cardano Wallet</th>
                      <th className="py-3 px-4 font-semibold">Status</th>
                      <th className="py-3 px-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredApps.map((app) => (
                      <tr key={app.id} className="hover:bg-slate-50/90 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900">{app.company_name}</div>
                          <div className="text-xs font-mono text-slate-500">{app.br_number}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-slate-800">{app.rep_name}</div>
                          <div className="text-xs text-slate-500">
                            {app.rep_role} • {app.rep_email}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <code className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-700">
                            {app.wallet_address.slice(0, 14)}...{app.wallet_address.slice(-8)}
                          </code>
                        </td>
                        <td className="py-3.5 px-4">{getStatusBadge(app.status)}</td>
                        <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedApp(app);
                              setActiveDocTab("br");
                            }}
                          >
                            Preview
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              handleDownloadDocument(
                                app.br_document_url,
                                `${app.company_name.replace(/\s+/g, "_")}_BR`
                              )
                            }
                          >
                            Download BR
                          </Button>
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            disabled={updatingId === app.id || app.status === "Verified"}
                            onClick={() => handleStatusUpdate(app.id, "Verified")}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={updatingId === app.id || app.status === "Rejected"}
                            onClick={() => handleStatusUpdate(app.id, "Rejected")}
                          >
                            Reject
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
      </div>

      {/* Document & Application Preview Modal */}
      {selectedApp && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden border">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b flex items-center justify-between bg-slate-50">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-slate-900">{selectedApp.company_name}</h2>
                  {getStatusBadge(selectedApp.status)}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  BR: {selectedApp.br_number} • Submitted on{" "}
                  {new Date(selectedApp.created_at).toLocaleString()}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedApp(null)}>
                ✕ Close
              </Button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Metadata Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm bg-slate-50 p-4 rounded-xl border">
                <div>
                  <span className="text-xs uppercase font-semibold text-slate-400 block">
                    Authorized Representative
                  </span>
                  <p className="font-medium text-slate-900 mt-0.5">
                    {selectedApp.rep_name} ({selectedApp.rep_role})
                  </p>
                  <p className="text-xs text-slate-600">{selectedApp.rep_email}</p>
                </div>

                <div>
                  <span className="text-xs uppercase font-semibold text-slate-400 block">
                    Cardano Wallet Identity (CIP-30)
                  </span>
                  <code className="text-xs font-mono text-indigo-700 break-all block mt-0.5">
                    {selectedApp.wallet_address}
                  </code>
                </div>

                <div className="md:col-span-2">
                  <span className="text-xs uppercase font-semibold text-slate-400 block">
                    Signed Authorization Payload
                  </span>
                  <p className="text-xs font-mono bg-white p-2 rounded border text-slate-700 mt-1 break-all">
                    {selectedApp.signed_message}
                  </p>
                </div>
              </div>

              <Separator />

              {/* Document Tabs + Download */}
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={activeDocTab === "br" ? "default" : "outline"}
                      onClick={() => setActiveDocTab("br")}
                    >
                      1. BR Certificate
                    </Button>
                    <Button
                      size="sm"
                      variant={activeDocTab === "kyc" ? "default" : "outline"}
                      onClick={() => setActiveDocTab("kyc")}
                    >
                      2. KYC Form
                    </Button>
                    <Button
                      size="sm"
                      variant={activeDocTab === "letter" ? "default" : "outline"}
                      onClick={() => setActiveDocTab("letter")}
                    >
                      3. Authorization Letter
                    </Button>
                  </div>

                  {(() => {
                    const docInfo = getActiveDocumentInfo(selectedApp);
                    return (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleDownloadDocument(docInfo.url, docInfo.fileName)}
                        >
                          ↓ Download {docInfo.title}
                        </Button>
                        <a
                          href={docInfo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-slate-100"
                        >
                          Open in New Tab ↗
                        </a>
                      </div>
                    );
                  })()}
                </div>

                {/* Live Document Preview Frame */}
                {(() => {
                  const docInfo = getActiveDocumentInfo(selectedApp);
                  const isImage = /\.(png|jpe?g|webp|gif)$/i.test(docInfo.url);

                  return (
                    <div className="border rounded-xl overflow-hidden bg-slate-100 min-h-[380px] flex items-center justify-center">
                      {isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={docInfo.url}
                          alt={docInfo.title}
                          className="max-h-[450px] w-auto object-contain"
                        />
                      ) : (
                        <iframe
                          src={docInfo.url}
                          title={docInfo.title}
                          className="w-full h-[420px] border-0"
                        />
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Modal Footer: Approve / Reject Actions */}
            <div className="px-6 py-4 border-t bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Approving marks this entity as Verified in the Robin registry.
              </span>
              <div className="flex gap-3">
                <Button
                  variant="destructive"
                  disabled={updatingId === selectedApp.id || selectedApp.status === "Rejected"}
                  onClick={() => handleStatusUpdate(selectedApp.id, "Rejected")}
                >
                  {updatingId === selectedApp.id ? "Updating..." : "Reject Application"}
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={updatingId === selectedApp.id || selectedApp.status === "Verified"}
                  onClick={() => handleStatusUpdate(selectedApp.id, "Verified")}
                >
                  {updatingId === selectedApp.id ? "Updating..." : "Approve & Verify"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}