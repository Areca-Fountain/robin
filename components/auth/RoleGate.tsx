"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { ROLE_LABEL, type AccountRole } from "@/lib/client-auth";
import { useAccount } from "@/components/auth/useAccount";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const PORTAL_NAME: Record<AccountRole, string> = {
  admin: "Admin Panel",
  company: "Company Dashboard",
  registrar: "Registrar Portal",
  none: "Home",
};

interface RoleGateProps {
  /** The only role allowed to see the children */
  role: Exclude<AccountRole, "none">;
  /** Registrar portal only: a first-time Google login becomes a registrar */
  registerAs?: "registrar";
  /** Show a Google sign-in card when nobody is signed in (otherwise the page shows its own) */
  signInTitle?: string;
  signInText?: string;
  children: ReactNode;
}

function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      {children}
    </div>
  );
}

/**
 * Lets only one kind of account in. Everyone else sees a plain "wrong account"
 * screen that points them to their own portal, so roles never mix in the UI.
 */
export default function RoleGate({
  role,
  registerAs,
  signInTitle,
  signInText,
  children,
}: RoleGateProps) {
  const { loading, account, error } = useAccount(registerAs);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.href },
    });
  }

  if (loading) {
    return (
      <Screen>
        <p className="text-sm text-slate-500" role="status">
          Checking your account…
        </p>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <div className="max-w-md space-y-4 text-center">
          <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {error}
          </p>
          <Button variant="outline" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </Screen>
    );
  }

  // Signed out
  if (!account) {
    if (!signInTitle) return <>{children}</>;
    return (
      <Screen>
        <Card className="w-full max-w-md shadow-lg border-slate-200">
          <CardHeader className="text-center space-y-2">
            <CardTitle className="text-2xl font-bold text-slate-900">{signInTitle}</CardTitle>
            {signInText && <CardDescription>{signInText}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              type="button"
              size="lg"
              className="w-full bg-indigo-600 hover:bg-indigo-700"
              onClick={() => void signInWithGoogle()}
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
      </Screen>
    );
  }

  if (account.role === role) return <>{children}</>;

  // Signed in, but with the wrong role
  const message = account.conflict
    ? account.conflict
    : role === "admin"
      ? "This Google account is not on the Robin admin list."
      : account.role === "none"
        ? `This Google account isn't registered as a ${ROLE_LABEL[role]}.`
        : `This Google account is a ${ROLE_LABEL[account.role]} account, so it can't use the ${PORTAL_NAME[role]}.`;

  return (
    <Screen>
      <Card className="w-full max-w-md shadow-lg border-slate-200">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-xl font-bold text-slate-900">Wrong account</CardTitle>
          <CardDescription>{message}</CardDescription>
          <p className="break-all text-xs text-slate-500">{account.email}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {account.role !== "none" && role !== "admin" && (
            <Link href={account.home}>
              <Button className="w-full bg-indigo-600 hover:bg-indigo-700">
                Go to my {PORTAL_NAME[account.role]}
              </Button>
            </Link>
          )}
          {account.role === "admin" && (
            <Link href={account.home}>
              <Button className="w-full bg-indigo-600 hover:bg-indigo-700">Go to the Admin Panel</Button>
            </Link>
          )}
          <Button variant="outline" className="w-full" onClick={() => void signOut()}>
            Sign out and use another account
          </Button>
        </CardContent>
      </Card>
    </Screen>
  );
}