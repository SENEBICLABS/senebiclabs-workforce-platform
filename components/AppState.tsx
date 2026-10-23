"use client";

import React, { createContext, useContext, useMemo, useState } from "react";
import { api, type Me } from "@/lib/api";
import { useAsync } from "@/lib/use-async";

interface AppState {
  /** null while loading, or if the session could not be resolved. */
  me: Me | null;
  meLoading: boolean;
  /** Re-reads the account, after something on it has changed. */
  reloadMe: () => void;
  /** Local preference. Not persisted — there is no endpoint behind it yet. */
  available: boolean;
  setAvailable: (next: boolean) => void;
  reviewedThisSession: number;
  countReview: () => void;
  toast: string | null;
  showToast: (message: string) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const { data: me, loading: meLoading, reload: reloadMe } = useAsync(() => api.me(), []);
  const [available, setAvailable] = useState(true);
  const [reviewedThisSession, setReviewed] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const value = useMemo<AppState>(
    () => ({
      me,
      meLoading,
      reloadMe,
      available,
      setAvailable,
      reviewedThisSession,
      countReview: () => setReviewed((n) => n + 1),
      toast,
      showToast: (message: string) => {
        setToast(message);
        window.setTimeout(() => setToast(null), 4000);
      },
    }),
    [me, meLoading, reloadMe, available, reviewedThisSession, toast]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useAppState must be used inside AppStateProvider");
  }
  return ctx;
}
