"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  status: "Pending" | "Under Review" | "Verified" | "Rejected" | string;
  created_at: string;
}

export default function RegistrarDashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [applications, setApplications] = useState<CompanyApplication[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Lock Warning Popup Modal State
  const [lockPopup, setLockPopup] = useState<{ title: string; message: string } | null>(null);

  // Preview & Edit Modal States
  const [previewApp, setPreviewApp] = useState<CompanyApplication | null>(null);
  const [editingApp, setEditingApp] = useState<CompanyApplication | null>(null);
  const [editRepName, setEditRepName] = useState("");
  const [editRepEmail, setEditRepEmail] = useState("");
  const [editRepRole, setEditRepRole] = useState("");
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editBrNumber, setEditBrNumber] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Fetch applications belonging to this authenticated registrar
  const loadRegistrarApplications = useCallback(async (currentUser: User) => {
    setAppsLoading(true);
    try {
      let query = supabase
        .from("company_applications")
        .select("*")
        .order("created_at", { ascending: false });

      if (currentUser.email) {
        query = query.or(`user_id.eq.${currentUser.id},rep_email.eq.${currentUser.email}`);
      } else {
        query = query.eq("user_id", currentUser.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setApplications((data as CompanyApplication[]) || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load your applications";
      setFeedback({ type: "error", text: msg });
    } finally {
      setAppsLoading(false);
    }
  }, []);

  // Listen for Google OAuth Session
  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      setAuthLoading(false);
      if (currentUser) {
        loadRegistrarApplications(currentUser);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        loadRegistrarApplications(currentUser);
      } else {
        setApplications([]);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadRegistrarApplications]);

  // Google Sign-In Trigger
  const handleGoogleSignIn = async () => {
    setFeedback(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/registrar`,
      },
    });
    if (error) {
      setFeedback({ type: "error", text: error.message });
    }
  };

  // Sign Out
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setApplications([]);
  };

  // Open Edit Modal (Checks live DB status first and pops up alert if Admin is reviewing)
  const openEditModal = async (app: CompanyApplication) => {
    // Check live status from Supabase in case admin just clicked Preview/Download
    const { data: latest } = await supabase
      .from("company_applications")
      .select("status")
      .eq("id", app.id)
      .single();

    const currentStatus = latest?.status || app.status;

    if (currentStatus !== app.status && user) {
      await loadRegistrarApplications(user);
    }

    if (currentStatus === "Under Review" || currentStatus === "Verified") {
      setLockPopup({
        title: "Action Locked — Under Admin Review",
        message:
          "This registration form is currently being checked by our admin panel, so editing or deleting this application is not permitted.",
      });
      return;
    }

    if (currentStatus === "Rejected") {
      setLockPopup({
        title: "Editing Disabled",
        message:
          "This registration application has been rejected by the admin panel and can no longer be edited. You may delete it and submit a new registration.",
      });
      return;
    }

    setEditingApp(app);
    setEditRepName(app.rep_name);
    setEditRepEmail(app.rep_email);
    setEditRepRole(app.rep_role);
    setEditCompanyName(app.company_name);
    setEditBrNumber(app.br_number);
  };

  // Save Edited Application (Re-verifies status is still Pending on DB level)
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingApp) return;
    setSavingEdit(true);
    setFeedback(null);

    try {
      const { data: latest, error: checkError } = await supabase
        .from("company_applications")
        .select("status")
        .eq("id", editingApp.id)
        .single();

      if (checkError) throw checkError;

      if (latest.status !== "Pending") {
        setEditingApp(null);
        if (user) await loadRegistrarApplications(user);
        setLockPopup({
          title: "Action Locked — Under Admin Review",
          message:
            "This registration form is currently being checked by our admin panel, so editing or deleting this application is not permitted.",
        });
        return;
      }

      const { error } = await supabase
        .from("company_applications")
        .update({
          rep_name: editRepName,
          rep_email: editRepEmail,
          rep_role: editRepRole,
          company_name: editCompanyName,
          br_number: editBrNumber,
        })
        .eq("id", editingApp.id)
        .eq("status", "Pending");

      if (error) throw error;

      setEditingApp(null);
      setFeedback({ type: "success", text: "Application details updated successfully." });
      if (user) await loadRegistrarApplications(user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update application";
      setFeedback({ type: "error", text: msg });
    } finally {
      setSavingEdit(false);
    }
  };

  // Delete Application (Checks live DB status and pops up alert if Admin is reviewing)
  const handleDeleteApplication = async (app: CompanyApplication) => {
    // Check live status from Supabase before allowing deletion
    const { data: latest } = await supabase
      .from("company_applications")
      .select("status")
      .eq("id", app.id)
      .single();

    const currentStatus = latest?.status || app.status;

    if (currentStatus !== app.status && user) {
      await loadRegistrarApplications(user);
    }

    if (currentStatus === "Under Review" || currentStatus === "Verified") {
      setLockPopup({
        title: "Action Locked — Under Admin Review",
        message:
          "This registration form is currently being checked by our admin panel, so editing or deleting this application is not permitted.",
      });
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to permanently delete the application for "${app.company_name}"?`
    );
    if (!confirmed) return;

    setDeletingId(app.id);
    setFeedback(null);

    try {
      const { error } = await supabase
        .from("company_applications")
        .delete()
        .eq("id", app.id);

      if (error) throw error;

      setApplications((prev) => prev.filter((item) => item.id !== app.id));
      setFeedback({ type: "success", text: `Application for "${app.company_name}" deleted.` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete application";
      setFeedback({ type: "error", text: msg });
    } finally {
      setDeletingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Verified":
        return (
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-100">
            Accepted / Verified
          </Badge>
        );
      case "Under Review":
        return (
          <Badge className="bg-indigo-100 text-indigo-800 border-indigo-300 hover:bg-indigo-100">
            Under Review (Locked)
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

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 text-sm">
        Checking registrar authentication...
      </div>
    );
  }

  // Unauthenticated View: Google Sign-In Gate
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="text-center space-y-2">
            <Badge variant="secondary" className="mx-auto w-fit">
              Registrar Onboarding
            </Badge>
            <CardTitle className="text-2xl font-bold text-slate-900">
              Sign in to Robin Portal
            </CardTitle>
            <CardDescription>
              Authenticate with your Google account to register companies and manage your submitted applications.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {feedback && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-xs">
                {feedback.text}
              </div>
            )}
            <Button
              type="button"
              size="lg"
              onClick={handleGoogleSignIn}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
            >
              Continue with Google
            </Button>
            <div className="text-center">
              <Link href="/" className="text-xs text-slate-500 hover:text-slate-800">
                ← Return to Home
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Authenticated Registrar Dashboard
  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-indigo-700 border-indigo-200 bg-indigo-50">
                Registrar Dashboard
              </Badge>
              <span className="text-xs text-slate-500">{user.email}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
              Welcome, {user.user_metadata?.full_name || "Company Registrar"}
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">
              Submit new company registrations or track and manage your existing applications.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link href="/register-company">
              <Button className="bg-indigo-600 hover:bg-indigo-700">
                + Register Company
              </Button>
            </Link>
            <Button
              variant="outline"
              onClick={() => loadRegistrarApplications(user)}
              disabled={appsLoading}
            >
              {appsLoading ? "Refreshing..." : "Refresh"}
            </Button>
            <Button variant="ghost" onClick={handleSignOut} className="text-slate-600">
              Sign Out
            </Button>
          </div>
        </div>

        {/* Status Rules Info Banner */}
        <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl px-4 py-3 text-xs text-indigo-900 flex flex-wrap gap-x-6 gap-y-1">
          <span>
            <strong>Pending:</strong> Edit &amp; Delete enabled
          </span>
          <span>
            <strong>Under Review / Accepted:</strong> Edit &amp; Delete locked (Admin reviewing)
          </span>
          <span>
            <strong>Rejected:</strong> Edit disabled, Delete enabled
          </span>
        </div>

        {/* Feedback Banner */}
        {feedback && (
          <div
            className={`px-4 py-3 rounded-lg border text-sm ${
              feedback.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            {feedback.text}
          </div>
        )}

        {/* Submitted Applications List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Your Submitted Applications ({applications.length})
            </CardTitle>
            <CardDescription>
              Manage applications submitted under your registrar account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {appsLoading ? (
              <div className="py-12 text-center text-slate-500 text-sm">
                Loading your submitted applications...
              </div>
            ) : applications.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <p className="text-slate-500 text-sm">
                  You haven&apos;t registered any companies yet.
                </p>
                <Link href="/register-company">
                  <Button variant="outline">Register Your First Company</Button>
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="border-b bg-slate-100/80 text-slate-600 text-xs uppercase">
                      <th className="py-3 px-4 font-semibold">Company &amp; BR</th>
                      <th className="py-3 px-4 font-semibold">Representative</th>
                      <th className="py-3 px-4 font-semibold">Submitted Date</th>
                      <th className="py-3 px-4 font-semibold">Status</th>
                      <th className="py-3 px-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {applications.map((app) => {
                      const canEdit = app.status === "Pending";
                      const canDelete = app.status === "Pending" || app.status === "Rejected";

                      return (
                        <tr key={app.id} className="hover:bg-slate-50">
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-900">{app.company_name}</div>
                            <div className="text-xs font-mono text-slate-500">{app.br_number}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-medium text-slate-800">{app.rep_name}</div>
                            <div className="text-xs text-slate-500">{app.rep_role}</div>
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-600">
                            {new Date(app.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-3.5 px-4">{getStatusBadge(app.status)}</td>
                          <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                            {/* Preview */}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setPreviewApp(app)}
                            >
                              Preview
                            </Button>

                            {/* Edit (Shows popup if locked) */}
                            <Button
                              size="sm"
                              variant="secondary"
                              className={!canEdit ? "opacity-50 cursor-not-allowed" : ""}
                              onClick={() => openEditModal(app)}
                            >
                              Edit
                            </Button>

                            {/* Delete (Shows popup if locked) */}
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={deletingId === app.id}
                              className={!canDelete ? "opacity-50 cursor-not-allowed" : ""}
                              onClick={() => handleDeleteApplication(app)}
                            >
                              {deletingId === app.id ? "Deleting..." : "Delete"}
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

      {/* Admin Review Lock Popup Modal */}
      {lockPopup && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-amber-200">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold shrink-0">
                !
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">{lockPopup.title}</h3>
                <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                  {lockPopup.message}
                </p>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button
                type="button"
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={() => setLockPopup(null)}
              >
                Understood
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewApp && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6 space-y-5 border max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{previewApp.company_name}</h2>
                <p className="text-xs text-slate-500">BR Number: {previewApp.br_number}</p>
              </div>
              <div className="flex items-center gap-2">
                {getStatusBadge(previewApp.status)}
                <Button variant="ghost" size="sm" onClick={() => setPreviewApp(null)}>
                  ✕
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs text-slate-400 uppercase font-semibold">Representative</span>
                <p className="font-medium text-slate-900">
                  {previewApp.rep_name} ({previewApp.rep_role})
                </p>
                <p className="text-xs text-slate-500">{previewApp.rep_email}</p>
              </div>
              <div>
                <span className="text-xs text-slate-400 uppercase font-semibold">Wallet Identity</span>
                <code className="text-xs block break-all bg-slate-100 p-1.5 rounded mt-1">
                  {previewApp.wallet_address}
                </code>
              </div>
            </div>

            <Separator />

            <div className="space-y-2 text-sm">
              <span className="text-xs text-slate-400 uppercase font-semibold block">
                Submitted Documents
              </span>
              <div className="flex flex-wrap gap-3">
                <a
                  href={previewApp.rep_letter_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 rounded-lg border text-xs font-medium hover:bg-slate-50"
                >
                  📄 View Authorization Letter ↗
                </a>
                <a
                  href={previewApp.br_document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 rounded-lg border text-xs font-medium hover:bg-slate-50"
                >
                  📄 View BR Certificate ↗
                </a>
                <a
                  href={previewApp.kyc_document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 rounded-lg border text-xs font-medium hover:bg-slate-50"
                >
                  📄 View KYC Form ↗
                </a>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setPreviewApp(null)}>
                Close Preview
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal (Only accessible while Pending) */}
      {editingApp && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-5 border">
            <div className="flex items-center justify-between border-b pb-3">
              <h2 className="text-lg font-bold text-slate-900">Edit Submitted Application</h2>
              <Button variant="ghost" size="sm" onClick={() => setEditingApp(null)}>
                ✕
              </Button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="editCompany">Company Registered Name *</Label>
                <Input
                  id="editCompany"
                  value={editCompanyName}
                  onChange={(e) => setEditCompanyName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="editBr">BR Number *</Label>
                <Input
                  id="editBr"
                  value={editBrNumber}
                  onChange={(e) => setEditBrNumber(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="editRepName">Representative Name *</Label>
                  <Input
                    id="editRepName"
                    value={editRepName}
                    onChange={(e) => setEditRepName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="editRepRole">Designation / Role *</Label>
                  <Input
                    id="editRepRole"
                    value={editRepRole}
                    onChange={(e) => setEditRepRole(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="editRepEmail">Official Email *</Label>
                <Input
                  id="editRepEmail"
                  type="email"
                  value={editRepEmail}
                  onChange={(e) => setEditRepEmail(e.target.value)}
                  required
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditingApp(null)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={savingEdit}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  {savingEdit ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}