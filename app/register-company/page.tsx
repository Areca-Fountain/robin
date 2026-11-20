"use client";

import React, { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface CardanoWalletApi {
  getUsedAddresses: () => Promise<string[]>;
  getUnusedAddresses: () => Promise<string[]>;
  getChangeAddress: () => Promise<string>;
}

interface LaceProvider {
  enable: () => Promise<CardanoWalletApi>;
  isEnabled: () => Promise<boolean>;
}

interface SubmittedApplication {
  id: string;
  rep_name: string;
  rep_email: string;
  rep_role: string;
  company_name: string;
  company_email?: string;
  br_number: string;
  wallet_address: string;
  status: string;
}

export default function RegisterCompanyPage() {
  // 1. Company & Representative Basic Details
  const [companyName, setCompanyName] = useState("");
  const [brNumber, setBrNumber] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [repName, setRepName] = useState("");
  const [repRole, setRepRole] = useState("");

  // 2. Documents (BR / ROC & Authorization/KYC)
  const [brFile, setBrFile] = useState<File | null>(null);
  const [repLetterFile, setRepLetterFile] = useState<File | null>(null);

  // 3. Lace Wallet Connect State (No Sign-in / No Message Signing Required)
  const [connected, setConnected] = useState(false);
  const [connectingWallet, setConnectingWallet] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");

  // 4. Submission & Status States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [applicationStatus, setApplicationStatus] = useState<"Draft" | "Pending">("Draft");
  const [submittedData, setSubmittedData] = useState<SubmittedApplication | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Connect Lace Wallet via CIP-30 (Connection Only — No Sign-in Needed)
  const handleConnectWallet = async () => {
    setErrorMsg("");
    setConnectingWallet(true);
    try {
      const cardanoObj =
        typeof window !== "undefined"
          ? (window as unknown as { cardano?: { lace?: LaceProvider } }).cardano
          : undefined;

      if (!cardanoObj?.lace) {
        setErrorMsg(
          "Lace Wallet extension not detected. Please install and unlock Lace in your browser, then refresh."
        );
        return;
      }

      const api = await cardanoObj.lace.enable();
      const usedAddresses = await api.getUsedAddresses();
      const unusedAddresses = await api.getUnusedAddresses();
      const changeAddress = await api.getChangeAddress();
      const address = usedAddresses[0] || unusedAddresses[0] || changeAddress;

      if (!address) {
        setErrorMsg("Could not retrieve a wallet address from Lace.");
        return;
      }

      setWalletAddress(address);
      setConnected(true);
    } catch (err: unknown) {
      setErrorMsg("Failed to connect Lace Wallet. Connection was rejected or wallet is locked.");
      console.error(err);
    } finally {
      setConnectingWallet(false);
    }
  };

  // Upload file to Supabase Storage ("company-documents" bucket)
  const uploadFileToSupabase = async (file: File, folder: string) => {
    const fileExt = file.name.split(".").pop() || "pdf";
    const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;

    const { error } = await supabase.storage
      .from("company-documents")
      .upload(fileName, file, { upsert: true });

    if (error) throw error;

    const { data: publicUrlData } = supabase.storage
      .from("company-documents")
      .getPublicUrl(fileName);

    return publicUrlData.publicUrl;
  };

  // Submit Application (Works without signing in — only Lace wallet connection is needed)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!brFile) {
      setErrorMsg("Please upload your Company BR / ROC certificate.");
      return;
    }

    if (!connected || !walletAddress) {
      setErrorMsg("Please connect your Cardano Lace Wallet before submitting.");
      return;
    }

    setIsSubmitting(true);

    try {
      // One account, one role: registrar and admin emails can't become company logins
      const emailRes = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: companyEmail }),
      });
      if (!emailRes.ok) {
        const emailJson = await emailRes.json().catch(() => ({}));
        setErrorMsg(emailJson.error ?? "That email can't be used for a company account.");
        return;
      }

      const brDocUrl = await uploadFileToSupabase(brFile, "br-docs");
      const repLetterUrl = repLetterFile
        ? await uploadFileToSupabase(repLetterFile, "letters")
        : brDocUrl;

      const cleanEmail = companyEmail.trim().toLowerCase();

      const { data, error } = await supabase
        .from("company_applications")
        .insert([
          {
            user_id: null,
            registrar_user_id: null,
            rep_name: repName.trim(),
            rep_email: cleanEmail,
            rep_role: repRole.trim() || "Authorized Representative",
            rep_letter_url: repLetterUrl,
            company_name: companyName.trim(),
            company_email: cleanEmail,
            br_number: brNumber.trim(),
            br_document_url: brDocUrl,
            kyc_document_url: brDocUrl,
            wallet_address: walletAddress,
            signed_message: `Wallet connected registration for ${companyName.trim()}`,
            wallet_signature: "lace_wallet_connected",
            status: "Pending",
          },
        ])
        .select()
        .single();

      if (error) throw error;

      setSubmittedData(data as SubmittedApplication);
      setApplicationStatus("Pending");
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
      setErrorMsg(`Failed to submit application: ${errorMessage}`);
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Status View after submission
  if (applicationStatus === "Pending" && submittedData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="w-full max-w-lg shadow-lg border-slate-200">
          <CardHeader className="text-center space-y-2">
            <div className="flex justify-center">
              <Badge
                variant="outline"
                className="bg-amber-100 text-amber-800 border-amber-300 px-4 py-1 text-sm font-semibold"
              >
                Status: {submittedData.status}
              </Badge>
            </div>
            <CardTitle className="text-2xl font-bold text-slate-900">
              Company Account Created!
            </CardTitle>
            <CardDescription>
              Your company registration is currently <strong>Pending</strong> verification by Robin&apos;s Admin team.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="bg-slate-100 p-4 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Company Name:</span>
                <span className="font-medium text-slate-900">{submittedData.company_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">BR / ROC Number:</span>
                <span className="font-medium text-slate-900">{submittedData.br_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Company Login Gmail:</span>
                <span className="font-medium text-slate-900">
                  {submittedData.company_email || submittedData.rep_email}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Contact Person:</span>
                <span className="font-medium text-slate-900">
                  {submittedData.rep_name} ({submittedData.rep_role})
                </span>
              </div>
              <Separator className="my-2" />
              <div>
                <span className="text-slate-500 block mb-1">
                  Connected Cardano Lace Wallet Address:
                </span>
                <code className="text-xs bg-white p-2 rounded border block break-all text-slate-700">
                  {submittedData.wallet_address}
                </code>
              </div>
              <div className="flex items-center gap-2 text-emerald-700 font-medium pt-1">
                <span>✓ Lace Wallet Connected</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setApplicationStatus("Draft");
                  setSubmittedData(null);
                }}
              >
                Register Another Company
              </Button>
              <Link href="/" className="flex-1">
                <Button className="w-full bg-indigo-600 hover:bg-indigo-700">
                  Back to Home
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link
              href="/"
              className="text-xs font-semibold uppercase tracking-wider text-indigo-600 hover:text-indigo-500"
            >
              ← Back to Robin Home
            </Link>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 mt-1">
              Register as a Company
            </h1>
            <p className="text-slate-500 mt-1">
              Enter your basic business details, upload your BR/ROC document, and connect your Cardano Lace wallet. No sign-in required.
            </p>
          </div>
          <Badge variant="secondary" className="text-xs px-3 py-1">
            Status: Draft
          </Badge>
        </div>

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Step 1: Basic Business Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">1. Basic Business Details</CardTitle>
              <CardDescription>
                Enter your company name, BR/ROC number, and official Gmail address (used later to access your Company Dashboard).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Registered Name *</Label>
                  <Input
                    id="companyName"
                    placeholder="e.g. Areca Fountain (Pvt) Ltd"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="brNumber">BR / ROC Number *</Label>
                  <Input
                    id="brNumber"
                    placeholder="e.g. PV 00234567"
                    value={brNumber}
                    onChange={(e) => setBrNumber(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="companyEmail">Company Official Email (Gmail Preferred) *</Label>
                <Input
                  id="companyEmail"
                  type="email"
                  placeholder="company.official@gmail.com"
                  value={companyEmail}
                  onChange={(e) => setCompanyEmail(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="repName">Primary Contact / Director Name *</Label>
                  <Input
                    id="repName"
                    placeholder="e.g. Kasun Perera"
                    value={repName}
                    onChange={(e) => setRepName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="repRole">Designation / Role *</Label>
                  <Input
                    id="repRole"
                    placeholder="e.g. Director / HR Manager"
                    value={repRole}
                    onChange={(e) => setRepRole(e.target.value)}
                    required
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Step 2: Submit BR / ROC */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">2. Submit BR / ROC Document</CardTitle>
              <CardDescription>
                Upload your Business Registration (BR / ROC) certificate. Verification status will remain Pending until verified by Robin&apos;s team.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="brFile">BR / ROC Certificate (PDF/Image) *</Label>
                  <Input
                    id="brFile"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => setBrFile(e.target.files?.[0] || null)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="repLetter">Supporting Document / Letter (Optional)</Label>
                  <Input
                    id="repLetter"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => setRepLetterFile(e.target.files?.[0] || null)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Step 3: Connect Lace Wallet (No Sign-in Required) */}
          <Card className="border-slate-300">
            <CardHeader>
              <CardTitle className="text-lg">3. Connect Cardano Lace Wallet</CardTitle>
              <CardDescription>
                Connect your Lace wallet to link your company&apos;s on-chain Cardano address. No message signing or login is required.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!connected ? (
                <Button
                  type="button"
                  disabled={connectingWallet}
                  onClick={handleConnectWallet}
                  className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700"
                >
                  {connectingWallet ? "Connecting Lace..." : "Connect Lace Wallet"}
                </Button>
              ) : (
                <div className="space-y-3 bg-emerald-50/70 p-4 rounded-lg border border-emerald-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 inline-block"></span>
                      <span>Lace Wallet Connected</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs text-red-600 h-6"
                      onClick={() => {
                        setConnected(false);
                        setWalletAddress("");
                      }}
                    >
                      Disconnect
                    </Button>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">
                      Connected Wallet Address (Saved to Database)
                    </span>
                    <p className="text-xs font-mono bg-white p-2.5 rounded border break-all text-slate-800">
                      {walletAddress}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Submit Button */}
          <div className="flex justify-end">
            <Button
              type="submit"
              size="lg"
              disabled={!connected || isSubmitting}
              className="w-full sm:w-auto px-8 bg-indigo-600 hover:bg-indigo-700"
            >
              {isSubmitting ? "Creating Company Account..." : "Submit Company Registration"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}