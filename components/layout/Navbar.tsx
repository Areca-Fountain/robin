"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Menu, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fetchAccount, type AccountInfo } from "@/lib/client-auth";
import GooeyNav from "@/components/ui/GooeyNav";

/* ------------------------------------------------------------------ */
/* Static links (same for everyone)                                    */
/* ------------------------------------------------------------------ */

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/verify", label: "Verify Service Letter" },
  { href: "/verify-private", label: "Private Verify" },
  { href: "/about", label: "About us" },
];

/** Same links, shaped for GooeyNav (no href -> renders buttons, we navigate with the Next router) */
const GOOEY_ITEMS = LINKS.map((l) => ({ label: l.label }));

/** Exact match, or a sub-route of the link (e.g. /verify/abc123). "/verify-private" does NOT match "/verify". */
function matchesLink(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

/** The filled pill that points each role to its own portal */
const DASHBOARD_LABEL = {
  registrar: "Registrar Dashboard",
  company: "Company Dashboard",
  admin: "Admin Dashboard",
} as const;

/** Signed-out dropdowns: two ways to register, two ways to log in */
const REGISTER_OPTIONS = [
  { href: "/register-company", label: "Register a Company", hint: "Upload your BR and connect Lace" },
  { href: "/registrar", label: "Become a Registrar", hint: "Register companies for others" },
];
const LOGIN_OPTIONS = [
  { href: "/login", label: "Company Login", hint: "Issue and manage service letters" },
  { href: "/login", label: "Team Login", hint: "Sign in with your assigned team email" },
  { href: "/registrar", label: "Registrar Login", hint: "Manage your submissions" },
];

/* ------------------------------------------------------------------ */
/* Who is signed in? (own small hook so the bar re-checks on navigation) */
/* ------------------------------------------------------------------ */

function useNavAccount() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const accountRef = useRef<AccountInfo | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const next = await fetchAccount();
        if (!active) return;
        accountRef.current = next;
        setAccount(next);
      } catch {
        if (!active) return;
        accountRef.current = null;
        setAccount(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    // Skip the request when we already know a real role (saves an API call per click).
    // Re-check while signed out / role "none" so a brand-new registrar shows up fast.
    const known = accountRef.current;
    if (!known || known.role === "none") void load();

    return () => {
      active = false;
    };
  }, [pathname]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        accountRef.current = null;
        setAccount(null);
      }
      if (event === "SIGNED_IN") {
        accountRef.current = null;
        void fetchAccount()
          .then((next) => {
            accountRef.current = next;
            setAccount(next);
          })
          .catch(() => setAccount(null));
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  return { loading, account };
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

function NavLink({
  href,
  label,
  active,
  onClick,
}: {
  href: string;
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`rounded-full px-3 py-1.5 text-[15px] transition-colors ${
        active
          ? "bg-robin-blue/10 font-semibold text-robin-navy"
          : "text-robin-navy hover:bg-robin-navy/5"
      }`}
    >
      {label}
    </Link>
  );
}

/** Pill-shaped dropdown used by "Register Now" and "Log in" */
function Dropdown({
  label,
  options,
  variant,
  onPick,
}: {
  label: string;
  options: { href: string; label: string; hint: string }[];
  variant: "filled" | "text";
  onPick?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-[15px] transition-colors ${
          variant === "filled"
            ? "bg-robin-navy font-medium text-white hover:bg-robin-navy/90"
            : "text-robin-navy hover:bg-robin-navy/5"
        }`}
      >
        {label}
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-3 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl"
        >
          {options.map((o) => (
            <Link
              key={o.href + o.label}
              href={o.href}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onPick?.();
              }}
              className="block rounded-xl px-3 py-2 hover:bg-robin-blue/10"
            >
              <span className="block text-sm font-semibold text-robin-navy">{o.label}</span>
              <span className="block text-xs text-slate-500">{o.hint}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The navbar                                                          */
/* ------------------------------------------------------------------ */

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, account } = useNavAccount();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile menu whenever the page changes
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const role = account?.role ?? "none";
  const signedIn = !!account;
  const dashboardHref = account && account.role !== "none" ? account.home : null;
  const dashboardLabel = role !== "none" ? DASHBOARD_LABEL[role] : null;

  function isActive(href: string) {
    return matchesLink(pathname, href);
  }

  // Which link is the current page? (-1 = none, e.g. /dashboard) -> GooeyNav goes idle (no pill)
  const activeLink = LINKS.reduce(
    (best, l, i) => (matchesLink(pathname, l.href) && (best < 0 || l.href.length > LINKS[best].href.length) ? i : best),
    -1,
  );

  async function signOut() {
    setMobileOpen(false);
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  /* Right-hand side, desktop */
  const desktopActions = loading ? (
    <div className="h-9 w-64 animate-pulse rounded-full bg-robin-navy/10" aria-hidden />
  ) : dashboardHref && dashboardLabel ? (
    <>
      <Link
        href={dashboardHref}
        className="rounded-full bg-robin-navy px-4 py-1.5 text-[15px] font-medium text-white hover:bg-robin-navy/90"
      >
        {dashboardLabel}
      </Link>
      <button
        type="button"
        onClick={() => void signOut()}
        className="rounded-full px-3 py-1.5 text-[15px] text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      >
        Sign Out
      </button>
    </>
  ) : (
    <>
      <Dropdown label="Register Now" options={REGISTER_OPTIONS} variant="filled" />
      {signedIn ? (
        // Signed in with Google but not registered as anything yet
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-full px-3 py-1.5 text-[15px] text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          Sign Out
        </button>
      ) : (
        <Dropdown label="Log in" options={LOGIN_OPTIONS} variant="text" />
      )}
    </>
  );

  return (
    <header className="sticky top-0 z-50 px-3 pt-3 sm:px-6">
      <div className="mx-auto w-full max-w-6xl rounded-[2rem] border border-white/70 bg-white/85 shadow-[0_8px_30px_rgba(15,61,138,0.10)] backdrop-blur-md lg:w-fit">
        <div className="flex items-center justify-between gap-4 px-4 py-2 sm:px-8 lg:gap-10">
          {/* Logo */}
          <Link href="/" aria-label="Robin home" className="shrink-0">
            <Image
              src="/robin-logo.png"
              alt="Robin – Leave with Impact"
              width={896}
              height={343}
              priority
              className="h-11 w-auto"
            />
          </Link>

          {/* Desktop links */}
          <div className="hidden lg:block">
            <GooeyNav
              ariaLabel="Main"
              items={GOOEY_ITEMS}
              activeIndex={Math.max(0, activeLink)}
              idle={activeLink < 0}
              onChange={(index: number) => router.push(LINKS[index].href)}
              theme="light"
              color="#0f3d8a"
              size="md"
              frame={false}
              particleCount={15}
              spread={56}
              animationTime={600}
              timeVariance={300}
              gooeyness={0.5}
              wobble={0.5}
              hoverEffect
              style={{ "--gn-ink": "#0f3d8a" }}
            />
          </div>

          {/* Desktop actions */}
          <div className="hidden items-center gap-2 lg:flex">{desktopActions}</div>

          {/* Mobile toggle */}
          <button
            type="button"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
            className="rounded-full p-2 text-robin-navy hover:bg-robin-navy/5 lg:hidden"
          >
            {mobileOpen ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </div>

        {/* Mobile panel */}
        {mobileOpen && (
          <div className="space-y-4 border-t border-slate-200/70 px-4 pb-5 pt-3 lg:hidden">
            <nav aria-label="Mobile" className="flex flex-col gap-1">
              {LINKS.map((l) => (
                <NavLink
                  key={l.href}
                  href={l.href}
                  label={l.label}
                  active={isActive(l.href)}
                  onClick={() => setMobileOpen(false)}
                />
              ))}
            </nav>

            {!loading && (
              <div className="flex flex-col gap-2">
                {dashboardHref && dashboardLabel ? (
                  <>
                    <Link
                      href={dashboardHref}
                      className="rounded-full bg-robin-navy px-4 py-2 text-center font-medium text-white"
                    >
                      {dashboardLabel}
                    </Link>
                    <button
                      type="button"
                      onClick={() => void signOut()}
                      className="rounded-full px-4 py-2 text-slate-500 hover:bg-slate-100"
                    >
                      Sign Out
                    </button>
                  </>
                ) : (
                  <>
                    <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Register
                    </p>
                    {REGISTER_OPTIONS.map((o) => (
                      <Link
                        key={o.href}
                        href={o.href}
                        className="rounded-full bg-robin-navy px-4 py-2 text-center font-medium text-white"
                      >
                        {o.label}
                      </Link>
                    ))}
                    {signedIn ? (
                      <button
                        type="button"
                        onClick={() => void signOut()}
                        className="rounded-full px-4 py-2 text-slate-500 hover:bg-slate-100"
                      >
                        Sign Out
                      </button>
                    ) : (
                      <>
                        <p className="px-1 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Log in
                        </p>
                        {LOGIN_OPTIONS.map((o) => (
                          <Link
                            key={o.href + o.label}
                            href={o.href}
                            className="rounded-full border border-robin-navy/20 px-4 py-2 text-center text-robin-navy"
                          >
                            {o.label}
                          </Link>
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}