"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchAccount, type AccountInfo } from "@/lib/client-auth";

interface State {
  loading: boolean;
  /** null = signed out */
  account: AccountInfo | null;
  error: string;
}

/**
 * The signed-in account and its single role. With intent "registrar", a brand-new
 * Google account is registered as a registrar (used only by the registrar portal).
 */
export function useAccount(intent?: "registrar"): State {
  const [state, setState] = useState<State>({ loading: true, account: null, error: "" });

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const account = await fetchAccount(intent);
        if (active) setState({ loading: false, account, error: "" });
      } catch (err) {
        const error = err instanceof Error ? err.message : "Could not check your account.";
        if (active) setState({ loading: false, account: null, error });
      }
    }

    void load();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") void load();
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [intent]);

  return state;
}