"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { fetchAccount } from "@/lib/client-auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Already signed in? Send each account to its own portal.
  useEffect(() => {
    let active = true;
    void fetchAccount()
      .then((account) => {
        if (!active || !account) return;
        if (account.role !== "none") {
          router.replace(account.home);
        } else {
          setError(
            account.conflict ??
              "This Google account isn't linked to any company. Use the email your company registered with, or register your company first."
          );
        }
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Could not check your account.");
      });
    return () => {
      active = false;
    };
  }, [router]);

  async function handleGoogle() {
    setError("");
    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/login` },
    });
    if (signInError) {
      setError(signInError.message);
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <Card className="w-full max-w-md shadow-lg border-slate-200">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-2xl font-bold text-slate-900">Company login</CardTitle>
          <CardDescription>
            Company accounts only. Sign in with the Google account your company registered with,
            or the one your company added you with.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            type="button"
            size="lg"
            className="w-full bg-indigo-600 hover:bg-indigo-700"
            onClick={handleGoogle}
            disabled={busy}
          >
            {busy ? "Opening Google…" : "Continue with Google"}
          </Button>

          {error && (
            <p
              className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
              role="alert"
            >
              {error}
            </p>
          )}

          {error && (
            <button
              type="button"
              className="w-full text-center text-xs text-slate-500 hover:text-slate-800"
              onClick={() => void supabase.auth.signOut().then(() => setError(""))}
            >
              Sign out and try another account
            </button>
          )}

          <p className="text-center text-sm text-slate-600">
            New company?{" "}
            <Link href="/register-company" className="text-indigo-700 hover:underline">
              Register here
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}