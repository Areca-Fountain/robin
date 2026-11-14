import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-xl space-y-6">
        <div className="inline-block px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold tracking-wide uppercase">
          The Robin..🔄
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          Robin Verification Portal
        </h1>
        <p className="text-slate-600 text-lg">
          Decentralized corporate identity & entity verification powered by Cardano smart contracts and Lace wallet signatures.
        </p>
        <div className="pt-2">
          <Link href="/register-company">
            <Button size="lg" className="bg-indigo-600 hover:bg-indigo-700 px-8">
              Register a Company
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
