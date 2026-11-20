"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { authedPost } from "@/lib/client-auth";
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
  user_id?: string | null;
  registrar_user_id?: string | null;
  rep_name: string;
  rep_email: string;
  rep_role: string;
  rep_letter_url: string;
  company_name: string;
  company_email?: string | null;
  br_number: string;
  br_document_url: string;
  kyc_document_url: string;
  wallet_address: string;
  signed_message: string;
  wallet_signature: string;
  status: "Pending" | "Under Review" | "Verified" | "Rejected" | string;
  created_at: string;
}

interface RegistrarProfile {
  user_id: string;
  registrar_type: "Individual" | "Business" | string;
  full_name: string;
  private_address: string;
  contact_number: string;
  nic_or_br_number: string;
  verification_doc_url: string;
  verification_status: "Unverified" | "Pending" | "Verified" | "Rejected" | string;
  subscription_plan: "Free" | "Premium" | string;
  subscription_status: string;
  updated_at?: string;
}

type AdminSection =
  | "overview"
  | "company-submissions"
  | "registrar-kyc"
  | "manage-users";

type DocTab = "letter" | "br" | "kyc";

export default function AdminDashboardPage() {
  const [activeSection, setActiveSection] = useState<AdminSection>("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [applications, setApplications] = useState<CompanyApplication[]>([]);
  const [registrars, setRegistrars] = useState<RegistrarProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "Pending" | "Under Review" | "Verified" | "Rejected"
  >("ALL");

  // Company Preview Modal States
  const [selectedApp, setSelectedApp] = useState<CompanyApplication | null>(null);
  const [activeDocTab, setActiveDocTab] = useState<DocTab>("br");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Registrar KYC Preview Modal State
  const [selectedRegistrar, setSelectedRegistrar] = useState<RegistrarProfile | null>(null);
  const [updatingRegistrarId, setUpdatingRegistrarId] = useState<string | null>(null);

  const [feedbackMsg, setFeedbackMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [adminEmail, setAdminEmail] = useState("");

  // Loads everything through the admin-only API (the server checks ADMIN_EMAILS)
  const loadAdminData = useCallback(async () => {
    const res = await authedPost("/api/admin/overview");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "Failed to load admin data");
    return json as {
      adminEmail: string;
      applications: CompanyApplication[];
      registrars: RegistrarProfile[];
    };
  }, []);

  // Manual refresh handler
  const fetchAllAdminData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadAdminData();
      setAdminEmail(data.adminEmail);
      setApplications(data.applications);
      setRegistrars(data.registrars);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load admin data";
      setFeedbackMsg({ type: "error", text: msg });
    } finally {
      setLoading(false);
    }
  }, [loadAdminData]);

  // Initial fetch on mount
  useEffect(() => {
    let isMounted = true;

    loadAdminData()
      .then((data) => {
        if (!isMounted) return;
        setAdminEmail(data.adminEmail);
        setApplications(data.applications);
        setRegistrars(data.registrars);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : "Failed to load admin data";
        setFeedbackMsg({ type: "error", text: msg });
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [loadAdminData]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  // Transition Pending company submission to "Under Review" when Admin previews/downloads
  const markAsUnderReviewIfPending = async (
    app: CompanyApplication
  ): Promise<CompanyApplication> => {
    if (app.status !== "Pending") return app;

    try {
      const res = await authedPost("/api/admin/applications", {
        id: app.id,
        status: "Under Review",
        onlyIfPending: true,
      });
      const json = await res.json().catch(() => ({}));

      if (res.ok) {
        const updatedApp: CompanyApplication = { ...app, status: "Under Review" };
        setApplications((prev) =>
          prev.map((item) => (item.id === app.id ? updatedApp : item))
        );
        return updatedApp;
      } else if (res.status !== 409) {
        setFeedbackMsg({
          type: "error",
          text: `Could not update status to Under Review: ${json.error ?? "unknown error"}`,
        });
      }
    } catch (err) {
      console.error("Failed to transition to Under Review:", err);
    }
    return app;
  };

  // Preview Company Application
  const handlePreviewClick = async (app: CompanyApplication) => {
    setActiveDocTab("br");
    setSelectedApp(app);
    const updatedApp = await markAsUnderReviewIfPending(app);
    setSelectedApp(updatedApp);
  };

  // Download Document
  const handleDownloadDocument = async (
    url: string,
    filename: string,
    app?: CompanyApplication
  ) => {
    if (app) {
      const updatedApp = await markAsUnderReviewIfPending(app);
      if (selectedApp?.id === app.id) {
        setSelectedApp(updatedApp);
      }
    }

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

  // Approve or Reject Company Application (Once Rejected, cannot be Re-Approved)
  const handleCompanyStatusUpdate = async (
    app: CompanyApplication,
    newStatus: "Verified" | "Rejected"
  ) => {
    if (app.status === "Rejected" && newStatus === "Verified") {
      setFeedbackMsg({
        type: "error",
        text: "Rejected applications cannot be approved again.",
      });
      return;
    }

    setUpdatingId(app.id);
    setFeedbackMsg(null);
    try {
      const res = await authedPost("/api/admin/applications", { id: app.id, status: newStatus });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed to update company status");

      setApplications((prev) =>
        prev.map((item) => (item.id === app.id ? { ...item, status: newStatus } : item))
      );

      if (selectedApp?.id === app.id) {
        setSelectedApp({ ...selectedApp, status: newStatus });
      }

      setFeedbackMsg({
        type: "success",
        text: `Company "${app.company_name}" status updated to ${newStatus}.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update company status";
      setFeedbackMsg({ type: "error", text: msg });
    } finally {
      setUpdatingId(null);
    }
  };

  // Approve or Reject Registrar Profile KYC (NIC / BR)
  const handleRegistrarKycUpdate = async (
    reg: RegistrarProfile,
    newStatus: "Verified" | "Rejected"
  ) => {
    if (reg.verification_status === "Rejected" && newStatus === "Verified") {
      setFeedbackMsg({
        type: "error",
        text: "Rejected registrar verification cannot be approved again.",
      });
      return;
    }

    setUpdatingRegistrarId(reg.user_id);
    setFeedbackMsg(null);
    try {
      const res = await authedPost("/api/admin/registrars", {
        userId: reg.user_id,
        verificationStatus: newStatus,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed to update registrar KYC");

      setRegistrars((prev) =>
        prev.map((r) =>
          r.user_id === reg.user_id ? { ...r, verification_status: newStatus } : r
        )
      );

      if (selectedRegistrar?.user_id === reg.user_id) {
        setSelectedRegistrar({ ...selectedRegistrar, verification_status: newStatus });
      }

      setFeedbackMsg({
        type: "success",
        text: `Registrar "${reg.full_name || reg.user_id}" KYC marked as ${newStatus}.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update registrar KYC";
      setFeedbackMsg({ type: "error", text: msg });
    } finally {
      setUpdatingRegistrarId(null);
    }
  };

  // Toggle Registrar Subscription Plan (Admin Override)
  const handleAdminPlanOverride = async (
    reg: RegistrarProfile,
    plan: "Free" | "Premium"
  ) => {
    setUpdatingRegistrarId(reg.user_id);
    setFeedbackMsg(null);
    try {
      const res = await authedPost("/api/admin/registrars", {
        userId: reg.user_id,
        subscriptionPlan: plan,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed to update plan");

      setRegistrars((prev) =>
        prev.map((r) =>
          r.user_id === reg.user_id ? { ...r, subscription_plan: plan } : r
        )
      );
      setFeedbackMsg({
        type: "success",
        text: `Updated ${reg.full_name || "Registrar"}'s plan to ${plan}.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update plan";
      setFeedbackMsg({ type: "error", text: msg });
    } finally {
      setUpdatingRegistrarId(null);
    }
  };

  // Filtered Company Submissions
  const filteredApps = applications.filter((app) => {
    const matchesStatus = statusFilter === "ALL" || app.status === statusFilter;
    const matchesQuery =
      app.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.br_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.rep_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (app.company_email || "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesQuery;
  });

  // Metrics
  const metrics = {
    totalCompanies: applications.length,
    pendingReview: applications.filter(
      (a) => a.status === "Pending" || a.status === "Under Review"
    ).length,
    verifiedCompanies: applications.filter((a) => a.status === "Verified").length,
    rejectedCompanies: applications.filter((a) => a.status === "Rejected").length,
    totalRegistrars: registrars.length,
    pendingRegistrarKyc: registrars.filter((r) => r.verification_status === "Pending").length,
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Verified":
        return (
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-100">
            Verified
          </Badge>
        );
      case "Under Review":
        return (
          <Badge className="bg-indigo-100 text-indigo-800 border-indigo-300 hover:bg-indigo-100">
            Under Review
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
            {status || "Pending"}
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

  const navItems: { id: AdminSection; label: string; badge?: string }[] = [
    { id: "overview", label: "Overview & Analytics" },
    {
      id: "company-submissions",
      label: "Company Submissions",
      badge: String(metrics.pendingReview),
    },
    {
      id: "registrar-kyc",
      label: "Registrar Verifications",
      badge: String(metrics.pendingRegistrarKyc),
    },
    {
      id: "manage-users",
      label: "Manage Users & Plans",
      badge: String(metrics.totalRegistrars + metrics.totalCompanies),
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* LEFT SIDEBAR NAVIGATION */}
      <aside className="w-full lg:w-68 bg-slate-900 text-slate-100 flex flex-col justify-between shrink-0 lg:min-h-screen">
        <div>
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <div>
              <Link href="/" className="text-lg font-bold tracking-tight text-white">
                Robin <span className="text-indigo-400">Admin</span>
              </Link>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Verification &amp; Operations Panel
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden px-2.5 py-1.5 rounded bg-slate-800 text-xs text-slate-200"
            >
              {mobileMenuOpen ? "Close" : "Menu"}
            </button>
          </div>

          <nav className={`${mobileMenuOpen ? "block" : "hidden"} lg:block p-3 space-y-1.5`}>
            {navItems.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setFeedbackMsg(null);
                    setActiveSection(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors text-left ${
                    isActive
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <span>{item.label}</span>
                  {item.badge !== undefined && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        isActive ? "bg-indigo-500 text-white" : "bg-slate-800 text-slate-300"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div
          className={`${
            mobileMenuOpen ? "block" : "hidden"
          } lg:block p-4 border-t border-slate-800 space-y-2`}
        >
          {adminEmail && (
            <p className="text-[11px] text-slate-400 truncate" title={adminEmail}>
              Signed in as {adminEmail}
            </p>
          )}
          <Link
            href="/"
            className="block w-full text-center py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-medium"
          >
            ← Back to Robin Portal
          </Link>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="block w-full text-center py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-medium"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* MAIN ADMIN WORKSPACE */}
      <main className="flex-1 p-5 sm:p-8 max-w-7xl w-full mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border shadow-2xs">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              {navItems.find((n) => n.id === activeSection)?.label}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Robin Team Control Center — Verify company BR documents, registrar NIC/BR KYC, and manage system users.
            </p>
          </div>
          <Button variant="outline" onClick={fetchAllAdminData} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh All Data"}
          </Button>
        </div>

        {/* Feedback Banner */}
        {feedbackMsg && (
          <div
            className={`px-4 py-3 rounded-xl border text-sm ${
              feedbackMsg.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            {feedbackMsg.text}
          </div>
        )}

        {/* ===================================================================== */}
        {/* 1. OVERVIEW & ANALYTICS                                               */}
        {/* ===================================================================== */}
        {activeSection === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total Companies</CardDescription>
                  <CardTitle className="text-2xl">{metrics.totalCompanies}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Pending / In Review</CardDescription>
                  <CardTitle className="text-2xl text-amber-600">
                    {metrics.pendingReview}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Verified Companies</CardDescription>
                  <CardTitle className="text-2xl text-emerald-600">
                    {metrics.verifiedCompanies}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Rejected Companies</CardDescription>
                  <CardTitle className="text-2xl text-red-600">
                    {metrics.rejectedCompanies}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total Registrars</CardDescription>
                  <CardTitle className="text-2xl text-indigo-600">
                    {metrics.totalRegistrars}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Pending Registrar KYC</CardDescription>
                  <CardTitle className="text-2xl text-amber-600">
                    {metrics.pendingRegistrarKyc}
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>

            {/* Priority Verification Queue */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">
                    Awaiting Admin Verification ({metrics.pendingReview})
                  </CardTitle>
                  <CardDescription>
                    Company registrations currently in Pending or Under Review status.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => setActiveSection("company-submissions")}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  Open Full Queue →
                </Button>
              </CardHeader>
              <CardContent>
                {applications.filter(
                  (a) => a.status === "Pending" || a.status === "Under Review"
                ).length === 0 ? (
                  <p className="text-sm text-slate-500 py-8 text-center">
                    All company submissions have been reviewed!
                  </p>
                ) : (
                  <div className="divide-y border rounded-xl">
                    {applications
                      .filter((a) => a.status === "Pending" || a.status === "Under Review")
                      .slice(0, 5)
                      .map((app) => (
                        <div
                          key={app.id}
                          className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-900">
                                {app.company_name}
                              </span>
                              {getStatusBadge(app.status)}
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              BR: {app.br_number} • Company Gmail:{" "}
                              {app.company_email || app.rep_email}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handlePreviewClick(app)}
                            >
                              Inspect Docs
                            </Button>
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={() => handleCompanyStatusUpdate(app, "Verified")}
                            >
                              Approve
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ===================================================================== */}
        {/* 2. COMPANY SUBMISSIONS (KYC & BR REVIEW)                              */}
        {/* ===================================================================== */}
        {activeSection === "company-submissions" && (
          <div className="space-y-6">
            <Card>
              <CardContent className="pt-6 flex flex-col sm:flex-row gap-4 justify-between">
                <Input
                  placeholder="Search company name, BR number, or company Gmail..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="sm:max-w-md"
                />
                <div className="flex flex-wrap gap-2">
                  {(["ALL", "Pending", "Under Review", "Verified", "Rejected"] as const).map(
                    (status) => (
                      <Button
                        key={status}
                        type="button"
                        size="sm"
                        variant={statusFilter === status ? "default" : "outline"}
                        onClick={() => setStatusFilter(status)}
                      >
                        {status === "ALL" ? "All" : status}
                      </Button>
                    )
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Company Applications ({filteredApps.length})
                </CardTitle>
                <CardDescription>
                  Previewing or downloading documents moves the submission to{" "}
                  <strong>Under Review</strong> while the admin team verifies the documents.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="py-12 text-center text-slate-500 text-sm">
                    Loading company submissions...
                  </div>
                ) : filteredApps.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-sm">
                    No company submissions match your current filter.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border-collapse">
                      <thead>
                        <tr className="border-b bg-slate-100/80 text-slate-600 text-xs uppercase">
                          <th className="py-3 px-4 font-semibold">Company &amp; BR</th>
                          <th className="py-3 px-4 font-semibold">Company Gmail / Rep</th>
                          <th className="py-3 px-4 font-semibold">Source</th>
                          <th className="py-3 px-4 font-semibold">Status</th>
                          <th className="py-3 px-4 font-semibold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredApps.map((app) => {
                          const isRejected = app.status === "Rejected";
                          const isVerified = app.status === "Verified";

                          return (
                            <tr key={app.id} className="hover:bg-slate-50/90">
                              <td className="py-3.5 px-4">
                                <div className="font-semibold text-slate-900">
                                  {app.company_name}
                                </div>
                                <div className="text-xs font-mono text-slate-500">
                                  {app.br_number}
                                </div>
                              </td>
                              <td className="py-3.5 px-4">
                                <div className="font-medium text-slate-800">
                                  {app.company_email || app.rep_email}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {app.rep_name} ({app.rep_role})
                                </div>
                              </td>
                              <td className="py-3.5 px-4 text-xs">
                                {app.registrar_user_id ? (
                                  <Badge variant="outline">Via Registrar</Badge>
                                ) : (
                                  <Badge variant="secondary">Direct Company</Badge>
                                )}
                              </td>
                              <td className="py-3.5 px-4">{getStatusBadge(app.status)}</td>
                              <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handlePreviewClick(app)}
                                >
                                  Preview
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    handleDownloadDocument(
                                      app.br_document_url,
                                      `${app.company_name.replace(/\s+/g, "_")}_BR`,
                                      app
                                    )
                                  }
                                >
                                  Download BR
                                </Button>
                                <Button
                                  size="sm"
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40"
                                  disabled={updatingId === app.id || isVerified || isRejected}
                                  title={
                                    isRejected
                                      ? "Rejected applications cannot be approved"
                                      : "Approve and Verify Company"
                                  }
                                  onClick={() => handleCompanyStatusUpdate(app, "Verified")}
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="disabled:opacity-40"
                                  disabled={updatingId === app.id || isRejected}
                                  onClick={() => handleCompanyStatusUpdate(app, "Rejected")}
                                >
                                  Reject
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ===================================================================== */}
        {/* 3. REGISTRAR VERIFICATIONS (NIC / BR KYC)                             */}
        {/* ===================================================================== */}
        {activeSection === "registrar-kyc" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Registrar Identity Verifications ({registrars.length})
              </CardTitle>
              <CardDescription>
                Verify third-party registrars who submitted their National Identity Card (NIC) or Business Registration (BR).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {registrars.length === 0 ? (
                <p className="text-sm text-slate-500 py-10 text-center">
                  No registrar profiles found yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead>
                      <tr className="border-b bg-slate-100/80 text-slate-600 text-xs uppercase">
                        <th className="py-3 px-4 font-semibold">Registrar Name</th>
                        <th className="py-3 px-4 font-semibold">Category</th>
                        <th className="py-3 px-4 font-semibold">NIC / BR Number</th>
                        <th className="py-3 px-4 font-semibold">KYC Status</th>
                        <th className="py-3 px-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {registrars.map((reg) => {
                        const isRejected = reg.verification_status === "Rejected";
                        const isVerified = reg.verification_status === "Verified";

                        return (
                          <tr key={reg.user_id} className="hover:bg-slate-50">
                            <td className="py-3.5 px-4">
                              <div className="font-semibold text-slate-900">
                                {reg.full_name || "Unnamed Registrar"}
                              </div>
                              <div className="text-xs text-slate-500">
                                {reg.contact_number || "No phone"}
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <Badge variant="outline">{reg.registrar_type}</Badge>
                            </td>
                            <td className="py-3.5 px-4 font-mono text-xs">
                              {reg.nic_or_br_number || "Not submitted"}
                            </td>
                            <td className="py-3.5 px-4">
                              {getStatusBadge(reg.verification_status)}
                            </td>
                            <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setSelectedRegistrar(reg)}
                              >
                                Inspect KYC
                              </Button>
                              <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40"
                                disabled={
                                  updatingRegistrarId === reg.user_id || isVerified || isRejected
                                }
                                onClick={() => handleRegistrarKycUpdate(reg, "Verified")}
                              >
                                Verify
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="disabled:opacity-40"
                                disabled={updatingRegistrarId === reg.user_id || isRejected}
                                onClick={() => handleRegistrarKycUpdate(reg, "Rejected")}
                              >
                                Reject
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ===================================================================== */}
        {/* 4. MANAGE USERS & SUBSCRIPTIONS                                       */}
        {/* ===================================================================== */}
        {activeSection === "manage-users" && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Registered Registrars &amp; Subscription Plans ({registrars.length})
                </CardTitle>
                <CardDescription>
                  Manage registrar accounts and their Free (up to 5 submissions) or Premium ($10/mo unlimited) subscriptions.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {registrars.length === 0 ? (
                  <p className="text-sm text-slate-500 py-8 text-center">
                    No registrars registered yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border-collapse">
                      <thead>
                        <tr className="border-b bg-slate-100/80 text-slate-600 text-xs uppercase">
                          <th className="py-3 px-4 font-semibold">Registrar</th>
                          <th className="py-3 px-4 font-semibold">Contact &amp; Address</th>
                          <th className="py-3 px-4 font-semibold">KYC</th>
                          <th className="py-3 px-4 font-semibold">Current Plan</th>
                          <th className="py-3 px-4 font-semibold text-right">Plan Control</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {registrars.map((reg) => (
                          <tr key={reg.user_id}>
                            <td className="py-3.5 px-4">
                              <div className="font-semibold text-slate-900">
                                {reg.full_name || "Registrar"}
                              </div>
                              <div className="text-xs text-slate-400 font-mono">
                                {reg.user_id.slice(0, 12)}...
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-xs text-slate-600">
                              <div>{reg.contact_number || "-"}</div>
                              <div className="text-slate-400">{reg.private_address || "-"}</div>
                            </td>
                            <td className="py-3.5 px-4">
                              {getStatusBadge(reg.verification_status)}
                            </td>
                            <td className="py-3.5 px-4">
                              <Badge
                                className={
                                  reg.subscription_plan === "Premium"
                                    ? "bg-indigo-100 text-indigo-800 border-indigo-300"
                                    : "bg-slate-100 text-slate-700"
                                }
                              >
                                {reg.subscription_plan}
                              </Badge>
                            </td>
                            <td className="py-3.5 px-4 text-right space-x-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={
                                  updatingRegistrarId === reg.user_id ||
                                  reg.subscription_plan === "Free"
                                }
                                onClick={() => handleAdminPlanOverride(reg, "Free")}
                              >
                                Set Free
                              </Button>
                              <Button
                                size="sm"
                                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                                disabled={
                                  updatingRegistrarId === reg.user_id ||
                                  reg.subscription_plan === "Premium"
                                }
                                onClick={() => handleAdminPlanOverride(reg, "Premium")}
                              >
                                Set Premium
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

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  System Company Accounts ({applications.length})
                </CardTitle>
                <CardDescription>
                  All companies registered directly or onboarded via third-party registrars.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead>
                      <tr className="border-b bg-slate-100/80 text-slate-600 text-xs uppercase">
                        <th className="py-3 px-4 font-semibold">Company</th>
                        <th className="py-3 px-4 font-semibold">Primary Login Gmail</th>
                        <th className="py-3 px-4 font-semibold">Cardano Wallet</th>
                        <th className="py-3 px-4 font-semibold">Verification</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {applications.map((app) => (
                        <tr key={app.id}>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">{app.company_name}</div>
                            <div className="text-xs font-mono text-slate-500">{app.br_number}</div>
                          </td>
                          <td className="py-3 px-4 text-xs">
                            {app.company_email || app.rep_email}
                          </td>
                          <td className="py-3 px-4">
                            <code className="text-xs bg-slate-100 px-2 py-0.5 rounded">
                              {app.wallet_address
                                ? `${app.wallet_address.slice(0, 16)}...`
                                : "Not connected"}
                            </code>
                          </td>
                          <td className="py-3 px-4">{getStatusBadge(app.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      {/* ======================================================================= */}
      {/* COMPANY SUBMISSION PREVIEW MODAL                                        */}
      {/* ======================================================================= */}
      {selectedApp && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden border">
            <div className="px-6 py-4 border-b flex items-center justify-between bg-slate-50">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-slate-900">{selectedApp.company_name}</h2>
                  {getStatusBadge(selectedApp.status)}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  BR: {selectedApp.br_number} • Company Login Gmail:{" "}
                  <strong>{selectedApp.company_email || selectedApp.rep_email}</strong>
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedApp(null)}>
                ✕ Close
              </Button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm bg-slate-50 p-4 rounded-xl border">
                <div>
                  <span className="text-xs uppercase font-semibold text-slate-400 block">
                    Contact / Representative
                  </span>
                  <p className="font-medium text-slate-900 mt-0.5">
                    {selectedApp.rep_name} ({selectedApp.rep_role})
                  </p>
                  <p className="text-xs text-slate-600">{selectedApp.rep_email}</p>
                </div>

                <div>
                  <span className="text-xs uppercase font-semibold text-slate-400 block">
                    Cardano Wallet Address
                  </span>
                  <code className="text-xs font-mono text-indigo-700 break-all block mt-0.5">
                    {selectedApp.wallet_address}
                  </code>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={activeDocTab === "br" ? "default" : "outline"}
                      onClick={() => setActiveDocTab("br")}
                    >
                      1. Company BR
                    </Button>
                    <Button
                      size="sm"
                      variant={activeDocTab === "letter" ? "default" : "outline"}
                      onClick={() => setActiveDocTab("letter")}
                    >
                      2. Authorization Letter
                    </Button>
                    <Button
                      size="sm"
                      variant={activeDocTab === "kyc" ? "default" : "outline"}
                      onClick={() => setActiveDocTab("kyc")}
                    >
                      3. Additional KYC
                    </Button>
                  </div>

                  {(() => {
                    const docInfo = getActiveDocumentInfo(selectedApp);
                    return (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            handleDownloadDocument(docInfo.url, docInfo.fileName, selectedApp)
                          }
                        >
                          ↓ Download {docInfo.title}
                        </Button>
                        <a
                          href={docInfo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-slate-100"
                        >
                          Open Tab ↗
                        </a>
                      </div>
                    );
                  })()}
                </div>

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

            <div className="px-6 py-4 border-t bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {selectedApp.status === "Rejected"
                  ? "This submission was permanently rejected and cannot be approved."
                  : "Approving verifies this company and enables Verified badges on their Service Letters."}
              </span>
              <div className="flex gap-3">
                <Button
                  variant="destructive"
                  disabled={updatingId === selectedApp.id || selectedApp.status === "Rejected"}
                  onClick={() => handleCompanyStatusUpdate(selectedApp, "Rejected")}
                >
                  {updatingId === selectedApp.id ? "Updating..." : "Reject Submission"}
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40"
                  disabled={
                    updatingId === selectedApp.id ||
                    selectedApp.status === "Verified" ||
                    selectedApp.status === "Rejected"
                  }
                  onClick={() => handleCompanyStatusUpdate(selectedApp, "Verified")}
                >
                  {updatingId === selectedApp.id ? "Updating..." : "Approve & Verify"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================= */}
      {/* REGISTRAR KYC PREVIEW MODAL                                             */}
      {/* ======================================================================= */}
      {selectedRegistrar && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-5 border max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Registrar KYC: {selectedRegistrar.full_name}
                </h2>
                <p className="text-xs text-slate-500">
                  Category: {selectedRegistrar.registrar_type} •{" "}
                  {selectedRegistrar.registrar_type === "Individual" ? "NIC" : "BR"}:{" "}
                  <strong>{selectedRegistrar.nic_or_br_number}</strong>
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedRegistrar(null)}>
                ✕ Close
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 p-3.5 rounded-xl border">
              <div>
                <span className="text-slate-400 block">Private Contact</span>
                <strong>{selectedRegistrar.contact_number || "N/A"}</strong>
              </div>
              <div>
                <span className="text-slate-400 block">Private Address</span>
                <strong>{selectedRegistrar.private_address || "N/A"}</strong>
              </div>
            </div>

            {selectedRegistrar.verification_doc_url ? (
              <div className="border rounded-xl overflow-hidden bg-slate-100 min-h-[300px] flex items-center justify-center">
                {/\.(png|jpe?g|webp|gif)$/i.test(selectedRegistrar.verification_doc_url) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedRegistrar.verification_doc_url}
                    alt="Registrar KYC Document"
                    className="max-h-[360px] w-auto object-contain"
                  />
                ) : (
                  <iframe
                    src={selectedRegistrar.verification_doc_url}
                    title="Registrar KYC Document"
                    className="w-full h-[340px] border-0"
                  />
                )}
              </div>
            ) : (
              <div className="py-10 text-center text-xs text-slate-500 border rounded-xl">
                No NIC / BR document uploaded yet.
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2 border-t">
              <Button
                variant="destructive"
                disabled={
                  updatingRegistrarId === selectedRegistrar.user_id ||
                  selectedRegistrar.verification_status === "Rejected"
                }
                onClick={() => handleRegistrarKycUpdate(selectedRegistrar, "Rejected")}
              >
                Reject KYC
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40"
                disabled={
                  updatingRegistrarId === selectedRegistrar.user_id ||
                  selectedRegistrar.verification_status === "Verified" ||
                  selectedRegistrar.verification_status === "Rejected"
                }
                onClick={() => handleRegistrarKycUpdate(selectedRegistrar, "Verified")}
              >
                Approve Registrar KYC
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}