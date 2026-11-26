"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { openPayHereCheckout, type PayHerePaymentObject } from "@/lib/payhere-client";
import { uploadDocument, openDocument, type UploadPurpose } from "@/lib/documents-client";
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
  registrar_user_id?: string | null;
  rep_name: string;
  rep_email: string;
  rep_role: string;
  rep_letter_url: string;
  company_name: string;
  company_email?: string;
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
  registrar_type: "Individual" | "Business";
  full_name: string;
  private_address: string;
  contact_number: string;
  nic_or_br_number: string;
  verification_doc_url: string;
  verification_status: "Unverified" | "Pending" | "Verified" | "Rejected" | string;
  subscription_plan: "Free" | "Premium";
  subscription_status: string;
}

type SidebarSection =
  | "manage-submissions"
  | "add-submission"
  | "profile-settings"
  | "profile-verification"
  | "manage-subscription";

export default function RegistrarDashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<SidebarSection>("manage-submissions");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [applications, setApplications] = useState<CompanyApplication[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  // Admin Review Popup Modal State
  const [reviewPopup, setReviewPopup] = useState<{ title: string; message: string } | null>(null);

  // Preview & Edit Modal States
  const [previewApp, setPreviewApp] = useState<CompanyApplication | null>(null);
  const [editingApp, setEditingApp] = useState<CompanyApplication | null>(null);
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editBrNumber, setEditBrNumber] = useState("");
  const [editCompanyEmail, setEditCompanyEmail] = useState("");
  const [editRepName, setEditRepName] = useState("");
  const [editRepRole, setEditRepRole] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Add New Company Submission Form States
  const [companyName, setCompanyName] = useState("");
  const [brNumber, setBrNumber] = useState("");
  const [repName, setRepName] = useState("");
  const [repRole, setRepRole] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [authLetterFile, setAuthLetterFile] = useState<File | null>(null);
  const [brDocFile, setBrDocFile] = useState<File | null>(null);
  const [submittingCompany, setSubmittingCompany] = useState(false);

  // Registrar Profile, Verification & Subscription States
  const [profile, setProfile] = useState<RegistrarProfile>({
    user_id: "",
    registrar_type: "Individual",
    full_name: "",
    private_address: "",
    contact_number: "",
    nic_or_br_number: "",
    verification_doc_url: "",
    verification_status: "Unverified",
    subscription_plan: "Free",
    subscription_status: "Active",
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // Password Change & Delete Account States
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Profile Verification Upload State
  const [verificationFile, setVerificationFile] = useState<File | null>(null);
  const [submittingVerification, setSubmittingVerification] = useState(false);

  // Subscription State
  const [updatingPlan, setUpdatingPlan] = useState(false);
  const [cancellingPlan, setCancellingPlan] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  // Helper: upload through our server (the storage bucket is private).
  // Returns the storage path to save in the database.
  const uploadDocumentFile = async (file: File, folder: string): Promise<string> =>
    uploadDocument(file, folder as UploadPurpose);

  const loadRegistrarApplications = useCallback(async (currentUser: User) => {
    setAppsLoading(true);
    try {
      const query = supabase
        .from("company_applications")
        .select("*")
        .or(`user_id.eq.${currentUser.id},registrar_user_id.eq.${currentUser.id}`)
        .order("created_at", { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      setApplications((data as CompanyApplication[]) || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load submissions";
      setFeedback({ type: "error", text: msg });
    } finally {
      setAppsLoading(false);
    }
  }, []);

  const loadRegistrarProfile = useCallback(async (currentUser: User) => {
    const fallback: RegistrarProfile = {
      user_id: currentUser.id,
      registrar_type: "Individual",
      full_name: currentUser.user_metadata?.full_name || "",
      private_address: "",
      contact_number: "",
      nic_or_br_number: "",
      verification_doc_url: "",
      verification_status: "Unverified",
      subscription_plan: "Free",
      subscription_status: "Active",
    };

    try {
      const { data, error } = await supabase
        .from("registrar_profiles")
        .select("*")
        .eq("user_id", currentUser.id)
        .maybeSingle();

      if (!error && data) {
        setProfile({ ...fallback, ...(data as Partial<RegistrarProfile>) });
      } else {
        setProfile(fallback);
      }
    } catch {
      setProfile(fallback);
    }
    setRepName(currentUser.user_metadata?.full_name || "");
  }, []);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!isMounted) return;
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      setAuthLoading(false);
      if (currentUser) {
        await loadRegistrarApplications(currentUser);
        await loadRegistrarProfile(currentUser);

        // Check PayHere return URL parameters
        const params = new URLSearchParams(window.location.search);
        const paymentStatus = params.get("payment");
        const orderId = params.get("order_id");

        if (paymentStatus === "success" && orderId && session?.access_token) {
          setActiveSection("manage-subscription");
          const res = await fetch("/api/payhere/confirm-client", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ orderId, accountType: "registrar" }),
          });
          if (res.ok) {
            setFeedback({
              type: "success",
              text: "PayHere payment confirmed! Upgraded to Premium Plan ($10/month) — Unlimited company submissions unlocked!",
            });
            await loadRegistrarProfile(currentUser);
          }
          window.history.replaceState({}, "", "/registrar");
        } else if (paymentStatus === "cancelled") {
          setActiveSection("manage-subscription");
          setFeedback({
            type: "error",
            text: "PayHere payment was cancelled. Your account remains on the Free Plan.",
          });
          window.history.replaceState({}, "", "/registrar");
        }
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        loadRegistrarApplications(currentUser);
        loadRegistrarProfile(currentUser);
      } else {
        setApplications([]);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadRegistrarApplications, loadRegistrarProfile]);

  const handleGoogleSignIn = async () => {
    setFeedback(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/registrar`,
      },
    });
    if (error) setFeedback({ type: "error", text: error.message });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setApplications([]);
  };

  const checkCompanyEmail = async (email: string): Promise<string | null> => {
    const clean = email.trim().toLowerCase();
    if (user?.email && clean === user.email.toLowerCase()) {
      return "The company email must be different from your own registrar account email.";
    }
    try {
      const res = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: clean }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return json.error ?? "That email can't be used for a company account.";
    } catch {
      return "Could not check the company email. Please try again.";
    }
    return null;
  };

  const handleAddCompanySubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (profile.subscription_plan === "Free" && applications.length >= 5) {
      setFeedback({
        type: "error",
        text: "Free Plan limit reached (Up to 5 submissions). Please upgrade to the Premium Plan ($10/month) for unlimited submissions.",
      });
      setActiveSection("manage-subscription");
      return;
    }

    if (!authLetterFile || !brDocFile) {
      setFeedback({
        type: "error",
        text: "Please upload both the Company Authorization Letter and the Company BR document.",
      });
      return;
    }

    if (!companyEmail.toLowerCase().endsWith("@gmail.com")) {
      setFeedback({
        type: "error",
        text: "Please enter a valid Company Gmail address (@gmail.com) for company portal access.",
      });
      return;
    }

    setSubmittingCompany(true);
    setFeedback(null);

    try {
      const authLetterUrl = await uploadDocumentFile(authLetterFile, "auth-letters");
      const brDocUrl = await uploadDocumentFile(brDocFile, "br-documents");

      const { error } = await supabase.from("company_applications").insert({
        user_id: user.id,
        registrar_user_id: user.id,
        company_name: companyName.trim(),
        company_email: companyEmail.trim().toLowerCase(),
        br_number: brNumber.trim(),
        rep_name: repName.trim() || profile.full_name || "Authorized Registrar",
        rep_email: companyEmail.trim().toLowerCase(),
        rep_role: repRole.trim() || "Authorized Registrar",
        rep_letter_url: authLetterUrl,
        br_document_url: brDocUrl,
        kyc_document_url: brDocUrl,
        wallet_address: "Pending Company Wallet Connection",
        signed_message: `Submitted by Registrar (${user.email}) for ${companyName.trim()}`,
        wallet_signature: "registrar_submission",
        status: "Pending",
      });

      if (error) throw error;

      setCompanyName("");
      setBrNumber("");
      setRepRole("");
      setCompanyEmail("");
      setAuthLetterFile(null);
      setBrDocFile(null);

      setFeedback({
        type: "success",
        text: `Company "${companyName}" submitted! Status is Pending until Robin's Admin team verifies the BR. Once verified, logging in with ${companyEmail} will open the Company Dashboard.`,
      });

      await loadRegistrarApplications(user);
      setActiveSection("manage-submissions");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to submit company registration";
      setFeedback({ type: "error", text: msg });
    } finally {
      setSubmittingCompany(false);
    }
  };

  const openEditModal = async (app: CompanyApplication) => {
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
      setReviewPopup({
        title: "Submission Under Review",
        message:
          "This company registration is currently under review by the Robin Admin team, so it can no longer be edited or deleted.",
      });
      return;
    }

    if (currentStatus === "Rejected") {
      setReviewPopup({
        title: "Editing Unavailable",
        message:
          "This application has been rejected by the admin team and cannot be edited. You can delete it and submit a new application.",
      });
      return;
    }

    setEditingApp(app);
    setEditCompanyName(app.company_name);
    setEditBrNumber(app.br_number);
    setEditCompanyEmail(app.company_email || app.rep_email);
    setEditRepName(app.rep_name);
    setEditRepRole(app.rep_role);
  };

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
        setReviewPopup({
          title: "Submission Under Review",
          message:
            "This company registration is currently under review by the Robin Admin team, so it can no longer be edited or deleted.",
        });
        return;
      }

      const currentEmail = (editingApp.company_email || editingApp.rep_email || "").toLowerCase();
      if (editCompanyEmail.trim().toLowerCase() !== currentEmail) {
        const emailProblem = await checkCompanyEmail(editCompanyEmail);
        if (emailProblem) {
          setFeedback({ type: "error", text: emailProblem });
          return;
        }
      }

      const { error } = await supabase
        .from("company_applications")
        .update({
          rep_email: editCompanyEmail.trim().toLowerCase(),
          company_name: editCompanyName.trim(),
          br_number: editBrNumber.trim(),
          company_email: editCompanyEmail.trim().toLowerCase(),
          rep_name: editRepName.trim(),
          rep_role: editRepRole.trim(),
        })
        .eq("id", editingApp.id)
        .eq("status", "Pending");

      if (error) throw error;

      setEditingApp(null);
      setFeedback({ type: "success", text: "Submission updated successfully." });
      if (user) await loadRegistrarApplications(user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update submission";
      setFeedback({ type: "error", text: msg });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteSubmission = async (app: CompanyApplication) => {
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
      setReviewPopup({
        title: "Submission Under Review",
        message:
          "This company registration is currently under review by the Robin Admin team, so it can no longer be edited or deleted.",
      });
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete the submission for "${app.company_name}"?`
    );
    if (!confirmed) return;

    setDeletingId(app.id);
    setFeedback(null);
    try {
      const { error } = await supabase.from("company_applications").delete().eq("id", app.id);
      if (error) throw error;
      setApplications((prev) => prev.filter((item) => item.id !== app.id));
      setFeedback({ type: "success", text: `Submission "${app.company_name}" removed.` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete submission";
      setFeedback({ type: "error", text: msg });
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaveProfileSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    setFeedback(null);

    try {
      const { error } = await supabase.from("registrar_profiles").upsert(
        {
          user_id: user.id,
          registrar_type: profile.registrar_type,
          full_name: profile.full_name,
          private_address: profile.private_address,
          contact_number: profile.contact_number,
          nic_or_br_number: profile.nic_or_br_number,
          verification_doc_url: profile.verification_doc_url,
          verification_status: profile.verification_status,
          subscription_plan: profile.subscription_plan,
          subscription_status: profile.subscription_status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      if (error) throw error;
      setFeedback({
        type: "success",
        text: "Private profile settings saved successfully.",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save profile settings";
      setFeedback({ type: "error", text: msg });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setFeedback({ type: "error", text: "Password must be at least 6 characters long." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setFeedback({ type: "error", text: "New password and confirmation do not match." });
      return;
    }

    setUpdatingPassword(true);
    setFeedback(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      setConfirmPassword("");
      setFeedback({ type: "success", text: "Account password updated successfully." });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to update password. Note: Google OAuth-only accounts may need password recovery enabled.";
      setFeedback({ type: "error", text: msg });
    } finally {
      setUpdatingPassword(false);
    }
  };

  const handleDeleteRegistrarAccount = async () => {
    if (!user) return;
    if (deleteConfirmText !== "DELETE") {
      setFeedback({
        type: "error",
        text: 'Please type "DELETE" in the confirmation box to delete your registrar account.',
      });
      return;
    }

    setDeletingAccount(true);
    setFeedback(null);
    try {
      await supabase
        .from("company_applications")
        .update({ user_id: null, registrar_user_id: null })
        .or(`user_id.eq.${user.id},registrar_user_id.eq.${user.id}`);

      await supabase.from("registrar_profiles").delete().eq("user_id", user.id);

      await supabase.auth.signOut();
      setUser(null);
      setApplications([]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete registrar account";
      setFeedback({ type: "error", text: msg });
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleSubmitProfileVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!profile.nic_or_br_number.trim()) {
      setFeedback({
        type: "error",
        text: `Please enter your ${profile.registrar_type === "Individual" ? "NIC Number" : "Business BR Number"}.`,
      });
      return;
    }

    setSubmittingVerification(true);
    setFeedback(null);

    try {
      let docUrl = profile.verification_doc_url;
      if (verificationFile) {
        docUrl = await uploadDocumentFile(verificationFile, "registrar-kyc");
      }

      if (!docUrl) {
        throw new Error(
          `Please upload a clear scan/photo of your ${
            profile.registrar_type === "Individual" ? "National Identity Card (NIC)" : "Business Registration (BR)"
          }.`
        );
      }

      const { error } = await supabase.from("registrar_profiles").upsert(
        {
          user_id: user.id,
          registrar_type: profile.registrar_type,
          full_name: profile.full_name,
          private_address: profile.private_address,
          contact_number: profile.contact_number,
          nic_or_br_number: profile.nic_or_br_number.trim(),
          verification_doc_url: docUrl,
          verification_status: "Pending",
          subscription_plan: profile.subscription_plan,
          subscription_status: profile.subscription_status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      if (error) throw error;

      setProfile((prev) => ({
        ...prev,
        verification_doc_url: docUrl,
        verification_status: "Pending",
      }));
      setVerificationFile(null);
      setFeedback({
        type: "success",
        text: "Verification documents submitted! Robin's Admin team will review your NIC/BR shortly.",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to submit verification";
      setFeedback({ type: "error", text: msg });
    } finally {
      setSubmittingVerification(false);
    }
  };

  // =========================================================================
  // 5. MANAGE SUBSCRIPTION VIA PAYHERE POPUP SDK ($10/MONTH PREMIUM) & CANCEL
  // =========================================================================
  const handleUpgradeViaPayHere = async () => {
    if (!user) return;
    setUpdatingPlan(true);
    setFeedback(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Session expired. Please sign in again.");

      const res = await fetch("/api/payhere/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          accountType: "registrar",
          phone: profile.contact_number || "0770000000",
          address: profile.private_address || "Colombo",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Could not start PayHere checkout.");
      }

      await openPayHereCheckout(data.payment as PayHerePaymentObject, {
        onCompleted: async (completedOrderId) => {
          try {
            const confirmRes = await fetch("/api/payhere/confirm-client", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                orderId: completedOrderId,
                accountType: "registrar",
              }),
            });
            if (confirmRes.ok) {
              setFeedback({
                type: "success",
                text: "PayHere payment confirmed! Upgraded to Premium Plan ($10/month) — Unlimited company submissions unlocked!",
              });
              await loadRegistrarProfile(user);
            } else {
              setFeedback({
                type: "error",
                text: "Payment received, but failed to update plan status.",
              });
            }
          } finally {
            setUpdatingPlan(false);
          }
        },
        onDismissed: () => {
          setUpdatingPlan(false);
          setFeedback({
            type: "error",
            text: "PayHere checkout window was closed before completing payment.",
          });
        },
        onError: (errMsg) => {
          setUpdatingPlan(false);
          setFeedback({ type: "error", text: `PayHere error: ${errMsg}` });
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to start PayHere payment";
      setFeedback({ type: "error", text: msg });
      setUpdatingPlan(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!user) return;
    setCancellingPlan(true);
    setFeedback(null);

    try {
      const { error } = await supabase.from("registrar_profiles").upsert(
        {
          user_id: user.id,
          registrar_type: profile.registrar_type,
          full_name: profile.full_name,
          private_address: profile.private_address,
          contact_number: profile.contact_number,
          nic_or_br_number: profile.nic_or_br_number,
          verification_doc_url: profile.verification_doc_url,
          verification_status: profile.verification_status,
          subscription_plan: "Free",
          subscription_status: "Cancelled",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      if (error) throw error;

      setProfile((prev) => ({
        ...prev,
        subscription_plan: "Free",
        subscription_status: "Cancelled",
      }));
      setShowCancelModal(false);
      setFeedback({
        type: "success",
        text: "Your Premium Plan subscription has been cancelled. Your account has been switched back to the Free Plan (up to 5 company registrations).",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to cancel subscription";
      setFeedback({ type: "error", text: msg });
    } finally {
      setCancellingPlan(false);
    }
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
            Pending
          </Badge>
        );
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 text-sm">
        Loading Robin Registrar Portal...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="text-center space-y-2">
            <Badge variant="secondary" className="mx-auto w-fit">
              Robin Registrar Portal
            </Badge>
            <CardTitle className="text-2xl font-bold text-slate-900">
              Sign up / Sign in as Registrar
            </CardTitle>
            <CardDescription>
              Individuals with NIC or Businesses with BR can register as third-party company registrars using Google Login.
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
                ← Return to Robin Home
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const navItems: { id: SidebarSection; label: string; badge?: string }[] = [
    {
      id: "manage-submissions",
      label: "Manage Submissions",
      badge: String(applications.length),
    },
    {
      id: "add-submission",
      label: "Add New Submissions",
    },
    {
      id: "profile-settings",
      label: "Profile Settings",
    },
    {
      id: "profile-verification",
      label: "Profile Verification",
      badge: profile.verification_status,
    },
    {
      id: "manage-subscription",
      label: "Manage Subscription",
      badge: profile.subscription_plan,
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
                Robin <span className="text-indigo-400">Registrar</span>
              </Link>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[180px]">
                {user.email}
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

          <nav
            className={`${
              mobileMenuOpen ? "block" : "hidden"
            } lg:block p-3 space-y-1.5`}
          >
            {navItems.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setFeedback(null);
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
                  {item.badge && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        isActive
                          ? "bg-indigo-500 text-white"
                          : "bg-slate-800 text-slate-300"
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
          } lg:block p-4 border-t border-slate-800 space-y-3`}
        >
          <div className="bg-slate-800/80 rounded-xl p-3 text-xs space-y-1">
            <div className="flex justify-between text-slate-400">
              <span>Plan Quota</span>
              <span className="text-white font-semibold">
                {applications.length} / {profile.subscription_plan === "Free" ? "5" : "∞"}
              </span>
            </div>
            <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-indigo-500 h-full transition-all"
                style={{
                  width:
                    profile.subscription_plan === "Free"
                      ? `${Math.min(100, (applications.length / 5) * 100)}%`
                      : "100%",
                }}
              />
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            onClick={handleSignOut}
            className="w-full justify-start text-slate-300 hover:text-white hover:bg-slate-800"
          >
            Sign Out
          </Button>
        </div>
      </aside>

      {/* MAIN WORKSPACE CONTENT */}
      <main className="flex-1 p-5 sm:p-8 max-w-6xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border shadow-2xs">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              {navItems.find((n) => n.id === activeSection)?.label}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Welcome back, {profile.full_name || user.user_metadata?.full_name || "Registrar"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={
                profile.verification_status === "Verified"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              }
            >
              Registrar KYC: {profile.verification_status}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={() => loadRegistrarApplications(user)}
              disabled={appsLoading}
            >
              {appsLoading ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        </div>

        {feedback && (
          <div
            className={`px-4 py-3 rounded-xl border text-sm ${
              feedback.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            {feedback.text}
          </div>
        )}

        {/* SECTION 1: MANAGE SUBMISSIONS */}
        {activeSection === "manage-submissions" && (
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">
                  Submitted Company Registrations ({applications.length})
                </CardTitle>
                <CardDescription>
                  Track verification status, inspect submitted BR &amp; Authorization letters, or edit pending entries.
                </CardDescription>
              </div>
              <Button
                className="bg-indigo-600 hover:bg-indigo-700"
                onClick={() => setActiveSection("add-submission")}
              >
                + Add New Submission
              </Button>
            </CardHeader>
            <CardContent>
              {appsLoading ? (
                <div className="py-12 text-center text-slate-500 text-sm">
                  Loading your submissions...
                </div>
              ) : applications.length === 0 ? (
                <div className="py-12 text-center space-y-3">
                  <p className="text-slate-500 text-sm">
                    No company submissions yet. Start by adding your first company registration.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setActiveSection("add-submission")}
                  >
                    + Add New Submission
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead>
                      <tr className="border-b bg-slate-100/80 text-slate-600 text-xs uppercase">
                        <th className="py-3 px-4 font-semibold">Company &amp; BR</th>
                        <th className="py-3 px-4 font-semibold">Company Login Gmail</th>
                        <th className="py-3 px-4 font-semibold">Submitted</th>
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
                              <div className="font-semibold text-slate-900">
                                {app.company_name}
                              </div>
                              <div className="text-xs font-mono text-slate-500">
                                {app.br_number}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-xs text-slate-700">
                              {app.company_email || app.rep_email}
                            </td>
                            <td className="py-3.5 px-4 text-xs text-slate-500">
                              {new Date(app.created_at).toLocaleDateString()}
                            </td>
                            <td className="py-3.5 px-4">{getStatusBadge(app.status)}</td>
                            <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setPreviewApp(app)}
                              >
                                View
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                className={!canEdit ? "opacity-50" : ""}
                                onClick={() => openEditModal(app)}
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={deletingId === app.id}
                                className={!canDelete ? "opacity-50" : ""}
                                onClick={() => handleDeleteSubmission(app)}
                              >
                                {deletingId === app.id ? "..." : "Delete"}
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

        {/* SECTION 2: ADD NEW SUBMISSIONS */}
        {activeSection === "add-submission" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">New Company Registration Submission</CardTitle>
              <CardDescription>
                Complete all 4 steps below. Once verified by Robin&apos;s team, logging in with the Company Gmail grants access to the Company Dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddCompanySubmission} className="space-y-6 max-w-2xl">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wider">
                    Step 1. Basic Details of the Company
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="compName">Company Registered Name *</Label>
                      <Input
                        id="compName"
                        placeholder="e.g. Acme Technologies (Pvt) Ltd"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="brNum">Business Registration (BR) Number *</Label>
                      <Input
                        id="brNum"
                        placeholder="e.g. PV 00123456"
                        value={brNumber}
                        onChange={(e) => setBrNumber(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="repName">Company Director / Contact Person *</Label>
                      <Input
                        id="repName"
                        placeholder="Full Name"
                        value={repName}
                        onChange={(e) => setRepName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="repRole">Designation *</Label>
                      <Input
                        id="repRole"
                        placeholder="e.g. Managing Director"
                        value={repRole}
                        onChange={(e) => setRepRole(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wider">
                    Step 2. Authorization Letter from the Subjective Company
                  </h3>
                  <p className="text-xs text-slate-500">
                    Upload the signed authorization letter permitting you to register this company on Robin.
                  </p>
                  <Input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => setAuthLetterFile(e.target.files?.[0] || null)}
                    required
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wider">
                    Step 3. Company Gmail Account (For Company Dashboard Access)
                  </h3>
                  <p className="text-xs text-slate-500">
                    When someone from the company logs into Robin with this Gmail address, they will automatically receive the Company Dashboard.
                  </p>
                  <Input
                    type="email"
                    placeholder="company.official@gmail.com"
                    value={companyEmail}
                    onChange={(e) => setCompanyEmail(e.target.value)}
                    required
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wider">
                    Step 4. Submit Company BR Document
                  </h3>
                  <p className="text-xs text-slate-500">
                    Verification Status will remain <strong>Pending</strong> until Robin&apos;s Admin team verifies the BR.
                  </p>
                  <Input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => setBrDocFile(e.target.files?.[0] || null)}
                    required
                  />
                </div>

                <div className="pt-2 flex items-center gap-3">
                  <Button
                    type="submit"
                    disabled={submittingCompany}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    {submittingCompany ? "Uploading & Submitting..." : "Submit Company Registration"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setActiveSection("manage-submissions")}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* SECTION 3: PROFILE SETTINGS */}
        {activeSection === "profile-settings" && (
          <div className="space-y-6 max-w-2xl">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Registrar Private Information</CardTitle>
                <CardDescription>
                  Your Name, Address, and Contact Number are kept strictly private and are not displayed publicly.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveProfileSettings} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="pName">Full Name / Business Name *</Label>
                      <Input
                        id="pName"
                        value={profile.full_name}
                        onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pPhone">Contact Number (Private) *</Label>
                      <Input
                        id="pPhone"
                        placeholder="+94 77 123 4567"
                        value={profile.contact_number}
                        onChange={(e) =>
                          setProfile({ ...profile, contact_number: e.target.value })
                        }
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="pAddress">Residential / Business Address (Private) *</Label>
                    <Input
                      id="pAddress"
                      placeholder="No. 123, Main Street, Colombo"
                      value={profile.private_address}
                      onChange={(e) =>
                        setProfile({ ...profile, private_address: e.target.value })
                      }
                      required
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={savingProfile}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    {savingProfile ? "Saving..." : "Save Profile Settings"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Change Password</CardTitle>
                <CardDescription>
                  Set or update a password for your registrar account ({user.email}).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="newPass">New Password</Label>
                      <Input
                        id="newPass"
                        type="password"
                        placeholder="Min 6 characters"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="confPass">Confirm New Password</Label>
                      <Input
                        id="confPass"
                        type="password"
                        placeholder="Re-enter password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <Button type="submit" variant="secondary" disabled={updatingPassword}>
                    {updatingPassword ? "Updating Password..." : "Update Password"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="text-lg text-red-700">Delete Registrar Account</CardTitle>
                <CardDescription>
                  Deleting your registrar account will permanently close your profile,{" "}
                  <strong>
                    but will NOT remove any companies you have already submitted to the Robin system.
                  </strong>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="delConfirm" className="text-xs text-slate-600">
                    Type <strong>DELETE</strong> below to confirm account deletion:
                  </Label>
                  <Input
                    id="delConfirm"
                    placeholder="DELETE"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deletingAccount || deleteConfirmText !== "DELETE"}
                  onClick={handleDeleteRegistrarAccount}
                >
                  {deletingAccount ? "Deleting Account..." : "Delete My Registrar Account"}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* SECTION 4: PROFILE VERIFICATION */}
        {activeSection === "profile-verification" && (
          <Card className="max-w-2xl">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Registrar Identity Verification</CardTitle>
                  <CardDescription>
                    Verify your profile with your <strong>NIC</strong> (for Individuals) or{" "}
                    <strong>BR</strong> (for Businesses).
                  </CardDescription>
                </div>
                <Badge
                  className={
                    profile.verification_status === "Verified"
                      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                      : profile.verification_status === "Pending"
                      ? "bg-amber-100 text-amber-800 border-amber-300"
                      : "bg-slate-100 text-slate-700 border-slate-300"
                  }
                >
                  {profile.verification_status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitProfileVerification} className="space-y-5">
                <div className="space-y-2">
                  <Label>Registrar Account Category *</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {(["Individual", "Business"] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setProfile({ ...profile, registrar_type: type })}
                        className={`p-3.5 rounded-xl border text-left transition-all ${
                          profile.registrar_type === type
                            ? "border-indigo-600 bg-indigo-50/70 text-indigo-900 font-semibold"
                            : "border-slate-200 hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        <div className="text-sm">{type}</div>
                        <div className="text-xs text-slate-500 font-normal mt-0.5">
                          {type === "Individual"
                            ? "Verify using National Identity Card (NIC)"
                            : "Verify using Business Registration (BR)"}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="nicBrNum">
                    {profile.registrar_type === "Individual"
                      ? "National Identity Card (NIC) Number *"
                      : "Business Registration (BR) Number *"}
                  </Label>
                  <Input
                    id="nicBrNum"
                    placeholder={
                      profile.registrar_type === "Individual"
                        ? "e.g. 199912345678 or 991234567V"
                        : "e.g. PV 00987654"
                    }
                    value={profile.nic_or_br_number}
                    onChange={(e) =>
                      setProfile({ ...profile, nic_or_br_number: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="kycUpload">
                    Upload{" "}
                    {profile.registrar_type === "Individual"
                      ? "NIC Copy (Front & Back PDF/Image)"
                      : "Business Registration (BR) Certificate"}{" "}
                    *
                  </Label>
                  <Input
                    id="kycUpload"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => setVerificationFile(e.target.files?.[0] || null)}
                  />
                  {profile.verification_doc_url && (
                    <button
                      type="button"
                      onClick={() => void openDocument(profile.verification_doc_url)}
                      className="text-xs text-indigo-600 hover:underline inline-block mt-1"
                    >
                      View currently uploaded document ↗
                    </button>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={
                    submittingVerification || profile.verification_status === "Verified"
                  }
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  {submittingVerification
                    ? "Submitting for Verification..."
                    : profile.verification_status === "Verified"
                    ? "Verified Registrar ✓"
                    : "Submit for Verification"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* SECTION 5: MANAGE SUBSCRIPTION (PAYHERE POPUP SDK $10/MO & CANCEL) */}
        {activeSection === "manage-subscription" && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Subscription Usage</CardTitle>
                <CardDescription>
                  You are currently on the <strong>{profile.subscription_plan} Plan</strong> (
                  {applications.length} of{" "}
                  {profile.subscription_plan === "Free" ? "5" : "Unlimited"} company registrations used).
                </CardDescription>
              </CardHeader>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
              <Card
                className={
                  profile.subscription_plan === "Free"
                    ? "border-2 border-indigo-600 shadow-md"
                    : ""
                }
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl">Free Plan</CardTitle>
                    {profile.subscription_plan === "Free" && (
                      <Badge className="bg-indigo-600 text-white">Current Plan</Badge>
                    )}
                  </div>
                  <div className="text-3xl font-bold text-slate-900 pt-2">
                    $0 <span className="text-sm font-normal text-slate-500">/ month</span>
                  </div>
                  <CardDescription>Up to 5 company registrations</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2 text-sm text-slate-600">
                    <li>✓ Register up to <strong>5 companies</strong></li>
                    <li>✓ Standard Admin BR &amp; Auth Letter review</li>
                    <li>✓ Automatic Company Dashboard provisioning</li>
                  </ul>
                  <Button type="button" variant="outline" className="w-full" disabled>
                    {profile.subscription_plan === "Free" ? "Active Plan" : "Included"}
                  </Button>
                </CardContent>
              </Card>

              <Card
                className={
                  profile.subscription_plan === "Premium"
                    ? "border-2 border-indigo-600 shadow-md"
                    : ""
                }
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl">Premium Plan</CardTitle>
                    {profile.subscription_plan === "Premium" && (
                      <Badge className="bg-indigo-600 text-white">Current Plan</Badge>
                    )}
                  </div>
                  <div className="text-3xl font-bold text-slate-900 pt-2">
                    $10 <span className="text-sm font-normal text-slate-500">/ month</span>
                  </div>
                  <CardDescription>Unlimited company registrations</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2 text-sm text-slate-600">
                    <li>✓ Register <strong>unlimited</strong> companies</li>
                    <li>✓ Priority verification queue for client companies</li>
                    <li>✓ Full registrar audit &amp; status tracking</li>
                  </ul>
                  {profile.subscription_plan === "Premium" ? (
                    <div className="space-y-2">
                      <Button
                        type="button"
                        className="w-full bg-emerald-600 hover:bg-emerald-600 text-white cursor-default"
                        disabled
                      >
                        Active Plan ✓
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                        disabled={cancellingPlan}
                        onClick={() => setShowCancelModal(true)}
                      >
                        {cancellingPlan ? "Cancelling..." : "Cancel Premium Plan"}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      className="w-full bg-indigo-600 hover:bg-indigo-700"
                      disabled={updatingPlan}
                      onClick={handleUpgradeViaPayHere}
                    >
                      {updatingPlan ? "Opening PayHere..." : "Upgrade with PayHere ($10/mo)"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>

      {/* Cancel Subscription Confirmation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-red-200">
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-slate-900">Cancel Premium Plan?</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Are you sure you want to cancel your <strong>Premium Plan ($10/month)</strong> and revert to the <strong>Free Plan</strong>?
              </p>
              {applications.length > 5 && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-lg text-xs">
                  You currently have <strong>{applications.length}</strong> company registrations. Your existing submissions will remain safe, but you won&apos;t be able to add new submissions on the Free Plan (5 limit) unless you upgrade again.
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={cancellingPlan}
                onClick={() => setShowCancelModal(false)}
              >
                Keep Premium
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={cancellingPlan}
                onClick={handleCancelSubscription}
              >
                {cancellingPlan ? "Cancelling..." : "Confirm Cancellation"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Under Review Popup Modal */}
      {reviewPopup && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-indigo-200">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold shrink-0">
                i
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">{reviewPopup.title}</h3>
                <p className="text-sm text-slate-600 mt-1 leading-relaxed">{reviewPopup.message}</p>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button
                type="button"
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={() => setReviewPopup(null)}
              >
                OK
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Submission Modal */}
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
                <span className="text-xs text-slate-400 uppercase font-semibold">
                  Company Login Gmail
                </span>
                <p className="font-medium text-slate-900">
                  {previewApp.company_email || previewApp.rep_email}
                </p>
              </div>
              <div>
                <span className="text-xs text-slate-400 uppercase font-semibold">
                  Company Representative
                </span>
                <p className="font-medium text-slate-900">
                  {previewApp.rep_name} ({previewApp.rep_role})
                </p>
              </div>
            </div>

            <Separator />

            <div className="space-y-2 text-sm">
              <span className="text-xs text-slate-400 uppercase font-semibold block">
                Submitted Documents
              </span>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void openDocument(previewApp.rep_letter_url)}
                  className="px-3 py-2 rounded-lg border text-xs font-medium hover:bg-slate-50"
                >
                  📄 View Authorization Letter ↗
                </button>
                <button
                  type="button"
                  onClick={() => void openDocument(previewApp.br_document_url)}
                  className="px-3 py-2 rounded-lg border text-xs font-medium hover:bg-slate-50"
                >
                  📄 View Company BR ↗
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setPreviewApp(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Submission Modal */}
      {editingApp && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-5 border">
            <div className="flex items-center justify-between border-b pb-3">
              <h2 className="text-lg font-bold text-slate-900">Edit Company Submission</h2>
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

              <div className="space-y-1.5">
                <Label htmlFor="editCompEmail">Company Gmail *</Label>
                <Input
                  id="editCompEmail"
                  type="email"
                  value={editCompanyEmail}
                  onChange={(e) => setEditCompanyEmail(e.target.value)}
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
                  <Label htmlFor="editRepRole">Designation *</Label>
                  <Input
                    id="editRepRole"
                    value={editRepRole}
                    onChange={(e) => setEditRepRole(e.target.value)}
                    required
                  />
                </div>
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