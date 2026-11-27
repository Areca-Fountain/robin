"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Menu, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fetchAccount, type AccountInfo } from "@/lib/client-auth";
import GooeyNav from "@/components/GooeyNav"; // installed by: npx shadcn@latest add @react-bits/GooeyNav-TS-CSS

/* ------------------------------------------------------------------ */
/* Static links (same for everyone)                                    */
/* ------------------------------------------------------------------ */

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/verify", label: "Verify Service Letter" },
  { href: "/verify-private", label: "Private Verify" },
  { href: "/about", label: "About us" },
];

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
      className={`rounded-full px-3 py-1.5 text-sm xl:text-[15px] transition-colors ${
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
        className={`inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-sm xl:text-[15px] transition-colors ${
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
          className="animate-dropdown absolute right-0 top-full z-50 mt-3 w-64 origin-top-right rounded-2xl border border-slate-200 bg-white p-2 shadow-xl"
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
  const [scrolled, setScrolled] = useState(false);
  const isHome = pathname === "/";

  // Home only: the bar floats over the hero and gets a stronger shadow once you scroll
  useEffect(() => {
    if (!isHome) return;
    const onScroll = () => setScrolled(window.scrollY > 24);
    const raf = requestAnimationFrame(onScroll); // also covers a restored scroll position
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, [isHome]);
  const barScrolled = isHome && scrolled;

  const role = account?.role ?? "none";
  const signedIn = !!account;
  const dashboardHref = account && account.role !== "none" ? account.home : null;
  const dashboardLabel = role !== "none" ? DASHBOARD_LABEL[role] : null;

  // Exact page or a sub-page of it ("/verify-private" no longer lights up "/verify")
  function isActive(href: string) {
    return pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
  }

  // Gooey desktop links -------------------------------------------------
  // -1 = none of the four links matches the current page (e.g. /dashboard)
  const pageIndex = LINKS.findIndex((l) => isActive(l.href));
  // Set on click so the blob starts moving right away instead of waiting for the route to load
  const [pending, setPending] = useState<number | null>(null);
  const gooeyIndex = pending ?? pageIndex;

  // When the page changes: close the mobile menu and drop the click-time blob position.
  // (Adjusting state while rendering, the pattern React recommends instead of an effect.)
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setMobileOpen(false);
    setPending(null);
  }

  // GooeyNav renders plain <a href>. Turn those clicks into client-side navigation.
  function onGooeyClick(e: React.MouseEvent<HTMLElement>) {
    const a = (e.target as HTMLElement).closest("a");
    const href = a?.getAttribute("href");
    if (!a || !href || href.startsWith("http")) return;
    e.preventDefault();
    setPending(LINKS.findIndex((l) => l.href === href));
    router.push(href);
  }

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
        className="rounded-full bg-robin-navy px-4 py-1.5 text-sm xl:text-[15px] font-medium text-white hover:bg-robin-navy/90"
      >
        {dashboardLabel}
      </Link>
      <button
        type="button"
        onClick={() => void signOut()}
        className="rounded-full px-3 py-1.5 text-sm xl:text-[15px] text-slate-500 hover:bg-slate-100 hover:text-slate-800"
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
          className="rounded-full px-3 py-1.5 text-sm xl:text-[15px] text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          Sign Out
        </button>
      ) : (
        <Dropdown label="Log in" options={LOGIN_OPTIONS} variant="text" />
      )}
    </>
  );

  return (
    <header
      className={`${
        isHome ? "anim-nav-drop fixed inset-x-0 pt-3 sm:pt-5" : "sticky pt-3"
      } top-0 z-50 px-3 sm:px-6`}
    >
      <div
        className={`mx-auto w-full max-w-6xl rounded-[2rem] border border-white/70 backdrop-blur-md transition-[background-color,box-shadow] duration-300 lg:w-fit ${
          barScrolled
            ? "bg-white/95 shadow-[0_14px_44px_rgba(15,61,138,0.28)]"
            : "bg-white/85 shadow-[0_8px_30px_rgba(15,61,138,0.10)]"
        }`}
      >
        <div className="flex items-center justify-between gap-4 px-4 py-2 sm:px-8 lg:gap-5 xl:gap-10">
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
          <div
            className={`robin-gooey hidden lg:block${gooeyIndex < 0 ? " robin-gooey--none" : ""}`}
            onClickCapture={onGooeyClick}
          >
            <GooeyNav
              key={gooeyIndex < 0 ? "none" : "on"}
              items={LINKS}
              activeIndex={Math.max(gooeyIndex, 0)}
              theme="light"
              color="#0f3d8a"
              activeTextColor="#ffffff"
              size="sm"
              particleCount={15}
              spread={56}
              animationTime={600}
              timeVariance={300}
              gooeyness={0.5}
              wobble={0.5}
              hoverEffect
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
        <div
          inert={!mobileOpen}
          aria-hidden={!mobileOpen}
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out lg:hidden ${
            mobileOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="min-h-0 overflow-hidden">
          <div className="max-h-[calc(100svh-7rem)] space-y-4 overflow-y-auto border-t border-slate-200/70 px-4 pb-5 pt-3">
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
          </div>
        </div>
      </div>
    </header>
  );
}