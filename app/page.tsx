"use client";

import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAccount } from "@/components/auth/useAccount";
import { Button } from "@/components/ui/button";

interface PortalCard {
  tag: string;
  tagClass: string;
  title: string;
  text: string;
  href: string;
  cta: string;
  variant: "default" | "outline" | "secondary";
}

const REGISTRAR_CARD: PortalCard = {
  tag: "For Registrars",
  tagClass: "text-indigo-600",
  title: "Registrar Portal",
  text: "Sign in with Google to submit third-party company registrations, verify NIC/BR KYC, and manage subscriptions.",
  href: "/registrar",
  cta: "Open Registrar Portal",
  variant: "default",
};

const REGISTER_COMPANY_CARD: PortalCard = {
  tag: "For Businesses",
  tagClass: "text-emerald-600",
  title: "Register a Company",
  text: "Register your company directly by uploading your BR/ROC and connecting your Cardano Lace wallet.",
  href: "/register-company",
  cta: "Register Company",
  variant: "outline",
};

const COMPANY_LOGIN_CARD: PortalCard = {
  tag: "For Businesses",
  tagClass: "text-emerald-600",
  title: "Company Login",
  text: "Already registered? Sign in with your company Google account to issue and manage service letters.",
  href: "/login",
  cta: "Company Login",
  variant: "outline",
};

const COMPANY_DASHBOARD_CARD: PortalCard = {
  ...COMPANY_LOGIN_CARD,
  title: "Company Dashboard",
  text: "Issue service letters, manage formats and your team, and check your verification status.",
  href: "/dashboard",
  cta: "Open Company Dashboard",
  variant: "default",
};

const VERIFY_CARD: PortalCard = {
  tag: "Public Check",
  tagClass: "text-purple-600",
  title: "Verify Service Letter",
  text: "Scan QR or enter document hash to check authenticity and company verification status.",
  href: "/verify",
  cta: "Verify Letter",
  variant: "outline",
};

const ADMIN_CARD: PortalCard = {
  tag: "Robin Team",
  tagClass: "text-slate-600",
  title: "Admin Dashboard",
  text: "Review company BR submissions, approve registrar NIC/BR KYC, and manage system users.",
  href: "/manage-applications",
  cta: "Open Admin Panel",
  variant: "default",
};

export default function HomePage() {
  const { loading, account } = useAccount();
  const role = account?.role ?? "none";

  // Each role only sees its own portal. Visiting the public pages is open to everyone.
  let cards: PortalCard[];
  if (account && role === "admin") cards = [ADMIN_CARD, VERIFY_CARD];
  else if (account && role === "company") cards = [COMPANY_DASHBOARD_CARD, VERIFY_CARD];
  else if (account && role === "registrar") cards = [REGISTRAR_CARD, VERIFY_CARD];
  else cards = [REGISTRAR_CARD, REGISTER_COMPANY_CARD, COMPANY_LOGIN_CARD, VERIFY_CARD];

  const navLinks = cards.map((c) => ({ href: c.href, label: c.title === "Verify Service Letter" ? "Verify Letter" : c.title }));

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col justify-between">
      {/* Top Navbar */}
      <header className="bg-white border-b px-6 py-4">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="text-xl font-bold tracking-tight text-slate-900">
            Robin <span className="text-indigo-600">Verification</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-2 sm:gap-3 text-sm">
            {!loading &&
              navLinks.map((link) => (
                <Link key={link.href} href={link.href}>
                  <Button variant="ghost" size="sm">
                    {link.label}
                  </Button>
                </Link>
              ))}
            {account && (
              <>
                <span className="hidden sm:inline text-xs text-slate-500 capitalize">
                  {account.email} · {role === "none" ? "no role yet" : role}
                </span>
                <Button size="sm" variant="outline" onClick={() => void signOut()}>
                  Sign out
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero & Role Cards */}
      <section className="max-w-5xl mx-auto px-6 py-16 text-center space-y-10">
        <div className="space-y-4 max-w-2xl mx-auto">
          <div className="inline-block px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold tracking-wide uppercase">
            UniHack 2026 • Cardano Blockchain
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Robin Verification Portal
          </h1>
          <p className="text-slate-600 text-lg">
            Decentralized corporate identity &amp; verifiable service letter platform powered by Cardano and Lace wallet.
          </p>
        </div>

        {!loading && (
          <div
            className={`grid grid-cols-1 gap-5 text-left ${
              cards.length >= 4
                ? "sm:grid-cols-2 lg:grid-cols-4"
                : "sm:grid-cols-2 max-w-2xl mx-auto"
            }`}
          >
            {cards.map((card) => (
              <div
                key={card.href}
                className="bg-white p-6 rounded-2xl border shadow-2xs flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <span className={`text-xs font-bold uppercase ${card.tagClass}`}>{card.tag}</span>
                  <h2 className="text-lg font-bold text-slate-900">{card.title}</h2>
                  <p className="text-xs text-slate-500 leading-relaxed">{card.text}</p>
                </div>
                <Link href={card.href}>
                  <Button
                    variant={card.variant}
                    className={`w-full ${card.variant === "default" ? "bg-indigo-600 hover:bg-indigo-700" : ""}`}
                  >
                    {card.cta}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="border-t bg-white py-5 text-center text-xs text-slate-400">
        Robin Decentralized Verification System • Built on Cardano
      </footer>
    </main>
  );
}