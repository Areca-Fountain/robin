"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export type CompanyRole = "primary" | "secondary" | "team";

export interface CompanyLetterhead {
  id: string;
  name: string;
  path: string;
  createdAt: string;
}

export interface Me {
  email: string;
  role: CompanyRole;
  company: {
    id: string;
    name: string;
    status: string;
    verified: boolean;
    walletAddress: string;
    primaryEmail: string;
    subscriptionPlan: "Free" | "Premium";
    subscriptionStatus: string;
    freeLetterLimit: number;
    remainingFreeLetters: number | null;
    letterheadUrl: string | null;
    letterheads: CompanyLetterhead[];
  };
  stats: {
    letters: number;
    lettersThisMonth: number;
    formats: number;
    generatedFormats: number;
    teamMembers: number;
  };
  recent: {
    id: string;
    employeeName: string;
    position: string | null;
    issuedAt: string;
    txHash: string;
  }[];
}

interface CompanyContextValue {
  me: Me | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  /** POST to one of our API routes with the Google login attached */
  authFetch: (path: string, body?: unknown) => Promise<Response>;
  signOut: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextValue | null>(null);

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompany must be used inside <CompanyProvider>");
  return ctx;
}

export default function CompanyProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const authFetch = useCallback(
    async (path: string, body: unknown = {}) => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        router.replace("/login");
        throw new Error("Please sign in.");
      }
      return fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
    },
    [router]
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  }, [router]);

  const refresh = useCallback(async () => {
    try {
      const res = await authFetch("/api/dashboard/me");
      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        setMe(null);
        setError(data.error ?? "Could not load your company.");
      } else {
        setMe(data as Me);
        setError("");
      }
    } catch {
      // authFetch already redirected to /login when there is no session
    } finally {
      setLoading(false);
    }
  }, [authFetch, router]);

  useEffect(() => {
    let active = true;
    async function init() {
      if (!active) return;
      await refresh();
    }
    void init();
    return () => {
      active = false;
    };
  }, [refresh]);

  return (
    <CompanyContext.Provider value={{ me, loading, error, refresh, authFetch, signOut }}>
      {children}
    </CompanyContext.Provider>
  );
}