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
  signData: (address: string, payload: string) => Promise<{ signature: string; key: string }>;
}

interface LaceProvider {
  enable: () => Promise<CardanoWalletApi>;
  isEnabled: () => Promise<boolean>;
}

interface SubmittedApplication {
  id: string;
  user_id?: string | null;
  rep_name: string;
  rep_email: string;
  rep_role: string;
  company_name: string;
  br_number: string;
  wallet_address: string;
  status: string;
}

function stringToHex(str: string): string {
  return Array.from(new TextEncoder().encode(str))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function RegisterCompanyPage() {
  // 1. Representative Details
  const [repName, setRepName] = useState("");
  const [repEmail, setRepEmail] = useState("");
  const [repRole, setRepRole] = useState("");
  const [repLetterFile, setRepLetterFile] = useState<File | null>(null);

  // 2. Company & KYC Details
  const [companyName, setCompanyName] = useState("");
  const [brNumber, setBrNumber] = useState("");
  const [brFile, setBrFile] = useState<File | null>(null);
  const [kycFile, setKycFile] = useState<File | null>(null);

  // 3. Wallet & Signature States
  const [walletApi, setWalletApi] = useState<CardanoWalletApi | null>(null);
  const [connected, setConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [signedMessage, setSignedMessage] = useState("");
  const [walletSignature, setWalletSignature] = useState("");
  const [isSigned, setIsSigned] = useState(false);

  // 4. Submission & Status States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [applicationStatus, setApplicationStatus] = useState<"Draft" | "Pending">("Draft");
  const [submittedData, setSubmittedData] = useState<SubmittedApplication | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Connect Lace Wallet via CIP-30
  const handleConnectWallet = async () => {
    setErrorMsg("");
    try {
      const cardanoObj =
        typeof window !== "undefined"
          ? (window as unknown as { cardano?: { lace?: LaceProvider } }).cardano
          : undefined;

      if (!cardanoObj?.lace) {
        setErrorMsg("Lace Wallet extension not detected. Please install and unlock Lace in Chrome, then refresh.");
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

      setWalletApi(api);
      setWalletAddress(address);
      setConnected(true);
    } catch (err: unknown) {
      setErrorMsg("Failed to connect Lace Wallet. User rejected the connection or wallet is locked.");
      console.error(err);
    }
  };

  // Sign Message by Wallet (CIP-30 Data Signing)
  const handleSignMessage = async () => {
    setErrorMsg("");
    if (!walletApi || !walletAddress) {
      setErrorMsg("Please connect your Lace Wallet first.");
      return;
    }
    try {
      const messageToSign = `Robin Verification: I (${repName || "Representative"}) authorize registration for ${companyName || "Company"} at ${new Date().toISOString()}`;
      const hexMessage = stringToHex(messageToSign);

      const signature = await walletApi.signData(walletAddress, hexMessage);

      setSignedMessage(messageToSign);
      setWalletSignature(JSON.stringify(signature));
      setIsSigned(true);
    } catch (err: unknown) {
      setErrorMsg("Wallet signature was cancelled or failed. Please try again.");
      console.error(err);
    }
  };

  // Upload file to Supabase Storage
  const uploadFileToSupabase = async (file: File, folder: string) => {
    const fileExt = file.name.split(".").pop();
    const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;

    const { error } = await supabase.storage
      .from("company-docs")
      .upload(fileName, file);

    if (error) throw error;

    const { data: publicUrlData } = supabase.storage
      .from("company-docs")
      .getPublicUrl(fileName);

    return publicUrlData.publicUrl;
  };

  // Submit Application (linked to authenticated Registrar user_id)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!repLetterFile || !brFile || !kycFile) {
      setErrorMsg("Please upload all required documents (Authorization Letter, BR Certificate, and KYC Form).");
      return;
    }

    if (!connected || !isSigned) {
      setErrorMsg("Please connect your Lace Wallet and sign the verification message before submitting.");
      return;
    }

    setIsSubmitting(true);

    try {
      // Get currently signed-in Registrar user (if logged in via Google OAuth)
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const repLetterUrl = await uploadFileToSupabase(repLetterFile, "letters");
      const brDocUrl = await uploadFileToSupabase(brFile, "br-docs");
      const kycDocUrl = await uploadFileToSupabase(kycFile, "kyc-docs");

      const { data, error } = await supabase
        .from("company_applications")
        .insert([
          {
            user_id: user?.id || null,
            rep_name: repName,
            rep_email: repEmail,
            rep_role: repRole,
            rep_letter_url: repLetterUrl,
            company_name: companyName,
            br_number: brNumber,
            br_document_url: brDocUrl,
            kyc_document_url: kycDocUrl,
            wallet_address: walletAddress,
            signed_message: signedMessage,
            wallet_signature: walletSignature,
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
              <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 px-4 py-1 text-sm font-semibold">
                Status: {submittedData.status}
              </Badge>
            </div>
            <CardTitle className="text-2xl font-bold text-slate-900">
              Application Submitted!
            </CardTitle>
            <CardDescription>
              Your company registration application has been submitted and is awaiting verification.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="bg-slate-100 p-4 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Company Name:</span>
                <span className="font-medium text-slate-900">{submittedData.company_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">BR Number:</span>
                <span className="font-medium text-slate-900">{submittedData.br_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Representative:</span>
                <span className="font-medium text-slate-900">{submittedData.rep_name} ({submittedData.rep_role})</span>
              </div>
              <Separator className="my-2" />
              <div>
                <span className="text-slate-500 block mb-1">Verified Identity (Cardano Wallet Hex Address):</span>
                <code className="text-xs bg-white p-2 rounded border block break-all text-slate-700">
                  {submittedData.wallet_address}
                </code>
              </div>
              <div className="flex items-center gap-2 text-emerald-700 font-medium pt-1">
                <span>✓ Signed by Lace Wallet</span>
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
              <Link href="/registrar" className="flex-1">
                <Button className="w-full bg-indigo-600 hover:bg-indigo-700">
                  Go to Registrar Dashboard
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
              href="/registrar"
              className="text-xs font-semibold uppercase tracking-wider text-indigo-600 hover:text-indigo-500"
            >
              ← Back to Registrar Dashboard
            </Link>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 mt-1">
              Register Company
            </h1>
            <p className="text-slate-500 mt-1">
              Submit representative verification, BR &amp; KYC documents, and sign with your Cardano Lace wallet.
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
          {/* Section 1: Representative Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">1. Representative Verification</CardTitle>
              <CardDescription>
                Provide details of the authorized representative and upload the company authorization letter.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="repName">Full Name *</Label>
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
                    placeholder="e.g. HR Manager / Director"
                    value={repRole}
                    onChange={(e) => setRepRole(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="repEmail">Official Email *</Label>
                <Input
                  id="repEmail"
                  type="email"
                  placeholder="kasun@company.lk"
                  value={repEmail}
                  onChange={(e) => setRepEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="repLetter">Company Authorization Letter (PDF/Image) *</Label>
                <Input
                  id="repLetter"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={(e) => setRepLetterFile(e.target.files?.[0] || null)}
                  required
                />
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Company & KYC Forms */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">2. Company &amp; KYC Documents</CardTitle>
              <CardDescription>
                Upload Business Registration (BR) and Know Your Customer (KYC) documentation for entity verification.
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
                  <Label htmlFor="brNumber">BR Number *</Label>
                  <Input
                    id="brNumber"
                    placeholder="e.g. PV 00234567"
                    value={brNumber}
                    onChange={(e) => setBrNumber(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="brFile">Upload BR Certificate *</Label>
                  <Input
                    id="brFile"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => setBrFile(e.target.files?.[0] || null)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kycFile">Upload KYC Form *</Label>
                  <Input
                    id="kycFile"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => setKycFile(e.target.files?.[0] || null)}
                    required
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 3: Lace Wallet Identity & Signing */}
          <Card className="border-slate-300">
            <CardHeader>
              <CardTitle className="text-lg">3. Web3 Identity Verification (Lace Wallet)</CardTitle>
              <CardDescription>
                Connect your Cardano Lace wallet to establish your on-chain identity and cryptographically sign this application.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!connected ? (
                <Button
                  type="button"
                  onClick={handleConnectWallet}
                  className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700"
                >
                  Connect Lace Wallet
                </Button>
              ) : (
                <div className="space-y-4 bg-slate-100 p-4 rounded-lg border">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Connected Wallet Address (Identity)
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs text-red-600 h-6"
                      onClick={() => {
                        setConnected(false);
                        setWalletApi(null);
                        setWalletAddress("");
                        setIsSigned(false);
                      }}
                    >
                      Disconnect
                    </Button>
                  </div>
                  <p className="text-xs font-mono bg-white p-2.5 rounded border break-all text-slate-800">
                    {walletAddress}
                  </p>

                  <div className="pt-2 flex items-center justify-between">
                    {!isSigned ? (
                      <Button
                        type="button"
                        onClick={handleSignMessage}
                        variant="secondary"
                        className="border border-slate-300"
                      >
                        Sign Verification Message
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 inline-block"></span>
                        <span>Signed by Wallet (Verified)</span>
                      </div>
                    )}
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
              disabled={!connected || !isSigned || isSubmitting}
              className="w-full sm:w-auto px-8"
            >
              {isSubmitting ? "Submitting Application..." : "Submit Application"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}