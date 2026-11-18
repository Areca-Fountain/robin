import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-50 flex flex-col justify-between">
      {/* Top Navbar */}
      <header className="bg-white border-b px-6 py-4">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="text-xl font-bold tracking-tight text-slate-900">
            Robin <span className="text-indigo-600">Verification</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-2 sm:gap-3 text-sm">
            <Link href="/registrar">
              <Button variant="ghost" size="sm">
                Registrar Portal
              </Button>
            </Link>
            <Link href="/register-company">
              <Button variant="ghost" size="sm">
                Register Company
              </Button>
            </Link>
            <Link href="/company">
              <Button variant="ghost" size="sm">
                Company Dashboard
              </Button>
            </Link>
            <Link href="/verify">
              <Button variant="ghost" size="sm">
                Verify Letter
              </Button>
            </Link>
            <Link href="/manage-applications">
              <Button size="sm" variant="outline">
                Admin Panel
              </Button>
            </Link>
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

        {/* 4 Main Portal Entry Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 text-left">
          <div className="bg-white p-6 rounded-2xl border shadow-2xs flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase text-indigo-600">For Registrars</span>
              <h2 className="text-lg font-bold text-slate-900">Registrar Portal</h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                Sign in with Google to submit third-party company registrations, verify NIC/BR KYC, and manage subscriptions.
              </p>
            </div>
            <Link href="/registrar">
              <Button className="w-full bg-indigo-600 hover:bg-indigo-700">
                Open Registrar Portal
              </Button>
            </Link>
          </div>

          <div className="bg-white p-6 rounded-2xl border shadow-2xs flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase text-emerald-600">For Businesses</span>
              <h2 className="text-lg font-bold text-slate-900">Register a Company</h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                Register your company directly by uploading your BR/ROC and connecting your Cardano Lace wallet.
              </p>
            </div>
            <Link href="/register-company">
              <Button variant="outline" className="w-full">
                Register Company
              </Button>
            </Link>
          </div>

          <div className="bg-white p-6 rounded-2xl border shadow-2xs flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase text-purple-600">Public Check</span>
              <h2 className="text-lg font-bold text-slate-900">Verify Service Letter</h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                Scan QR or enter document hash to check authenticity and company verification status.
              </p>
            </div>
            <Link href="/verify">
              <Button variant="outline" className="w-full">
                Verify Letter
              </Button>
            </Link>
          </div>

          <div className="bg-white p-6 rounded-2xl border shadow-2xs flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase text-slate-600">Robin Team</span>
              <h2 className="text-lg font-bold text-slate-900">Admin Dashboard</h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                Review company BR submissions, approve registrar NIC/BR KYC, and manage system users.
              </p>
            </div>
            <Link href="/manage-applications">
              <Button variant="secondary" className="w-full">
                Open Admin Panel
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t bg-white py-5 text-center text-xs text-slate-400">
        Robin Decentralized Verification System • Built on Cardano
      </footer>
    </main>
  );
}