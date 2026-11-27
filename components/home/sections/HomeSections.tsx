"use client";

import Link from "next/link";
import { useAccount } from "@/components/auth/useAccount";
import { Button } from "@/components/ui/button";
import Reveal from "@/components/motion/Reveal";

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

export default function HomeSections() {
  const { loading, account } = useAccount();
  const role = account?.role ?? "none";

  let cards: PortalCard[];
  if (account && role === "admin") cards = [ADMIN_CARD, VERIFY_CARD];
  else if (account && role === "company") cards = [COMPANY_DASHBOARD_CARD, VERIFY_CARD];
  else if (account && role === "registrar") cards = [REGISTRAR_CARD, VERIFY_CARD];
  else cards = [REGISTRAR_CARD, REGISTER_COMPANY_CARD, COMPANY_LOGIN_CARD, VERIFY_CARD];

  return (
    // Slides up over the hero like a sheet
    <div className="relative z-20 -mt-10 flex flex-col justify-between rounded-t-[2.5rem] bg-slate-50 shadow-[0_-20px_60px_rgba(0,0,0,0.45)] sm:-mt-14 sm:rounded-t-[3rem]">
      {/* Role cards */}
      <section id="get-started" className="mx-auto max-w-5xl scroll-mt-24 space-y-10 px-6 py-14 text-center sm:py-16">
        <Reveal className="mx-auto max-w-2xl space-y-4">
          <div className="inline-block rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">
            UniHack 2026 • Cardano &amp; Midnight
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Robin Verification Portal
          </h2>
          <p className="text-lg text-slate-600">
            Decentralized corporate identity &amp; verifiable service letter platform powered by Cardano, Midnight and Lace wallet.
          </p>
        </Reveal>

        {!loading && (
          <div
            className={`grid grid-cols-1 gap-5 text-left ${
              cards.length >= 4
                ? "sm:grid-cols-2 lg:grid-cols-4"
                : "mx-auto max-w-2xl sm:grid-cols-2"
            }`}
          >
            {cards.map((card, i) => (
              <Reveal key={card.href + card.title} delay={i * 90} className="h-full">
                <div className="flex h-full flex-col justify-between space-y-4 rounded-2xl border bg-white p-6 shadow-2xs transition duration-300 hover:-translate-y-1 hover:shadow-lg">
                  <div className="space-y-2">
                    <span className={`text-xs font-bold uppercase ${card.tagClass}`}>{card.tag}</span>
                    <h3 className="text-lg font-bold text-slate-900">{card.title}</h3>
                    <p className="text-xs leading-relaxed text-slate-500">{card.text}</p>
                  </div>
                  <Link href={card.href}>
                    <Button
                      variant={card.variant}
                      className={`w-full ${
                        card.variant === "default" ? "bg-indigo-600 hover:bg-indigo-700" : ""
                      }`}
                    >
                      {card.cta}
                    </Button>
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
        )}
      </section>

      {/* Pricing & Packages */}
      <section id="pricing" className="mx-auto w-full max-w-5xl scroll-mt-24 space-y-8 px-6 pb-16">
        <Reveal className="space-y-2 text-center">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
            Simple &amp; Transparent Pricing
          </span>
          <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">
            Packages for Companies &amp; Registrars
          </h2>
          <p className="text-sm text-slate-500">
            Start for free and upgrade anytime via PayHere for unlimited issuance and registrations.
          </p>
        </Reveal>

        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
          {/* Free Tier */}
          <Reveal className="h-full">
            <div className="flex h-full flex-col justify-between space-y-6 rounded-2xl border border-slate-200 bg-white p-7 shadow-2xs transition duration-300 hover:-translate-y-1 hover:shadow-lg">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-900">Free Starter</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                    Free Forever
                  </span>
                </div>
                <div className="text-3xl font-bold text-slate-900">
                  $0 <span className="text-sm font-normal text-slate-500">/ month</span>
                </div>
                <p className="text-xs text-slate-500">
                  Ideal for trying out Cardano-verified service letters and company onboarding.
                </p>
                <ul className="space-y-2 pt-2 text-sm text-slate-700">
                  <li>✓ <strong>Companies:</strong> Issue up to <strong>5 service letters</strong></li>
                  <li>✓ <strong>Registrars:</strong> Register up to <strong>5 companies</strong></li>
                  <li>✓ Tamper-proof QR codes &amp; public verification</li>
                </ul>
              </div>
              <Link href="/register-company">
                <Button variant="outline" className="w-full">
                  Get Started Free
                </Button>
              </Link>
            </div>
          </Reveal>

          {/* Premium Tier */}
          <Reveal className="h-full" delay={120}>
            <div className="flex h-full flex-col justify-between space-y-6 rounded-2xl border-2 border-indigo-600 bg-white p-7 shadow-md transition duration-300 hover:-translate-y-1 hover:shadow-xl">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-indigo-700">Premium Unlimited</span>
                  <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                    PayHere Subscription
                  </span>
                </div>
                <div className="text-3xl font-bold text-slate-900">
                  $10 <span className="text-sm font-normal text-slate-500">/ month</span>
                </div>
                <p className="text-xs text-slate-500">
                  Built for growing organizations and high-volume company registrars.
                </p>
                <ul className="space-y-2 pt-2 text-sm text-slate-700">
                  <li>✓ <strong>Companies:</strong> Issue <strong>unlimited</strong> service letters</li>
                  <li>✓ <strong>Registrars:</strong> Register <strong>unlimited</strong> companies</li>
                  <li>✓ Priority support &amp; monthly billing via PayHere</li>
                </ul>
              </div>
              <Link href={role === "registrar" ? "/registrar" : "/dashboard/subscription"}>
                <Button className="w-full bg-indigo-600 hover:bg-indigo-700">
                  Upgrade to Premium ($10/mo)
                </Button>
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="border-t bg-white py-5 text-center text-xs text-slate-400">
        Robin Decentralized Verification System • Built on Cardano &amp; Midnight
      </footer>
    </div>
  );
}
