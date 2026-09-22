"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "./api";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * One loading/error contract for every screen, so no screen invents its own —
 * and none can render a blank while it waits or a raw error when it fails.
 *
 * Loading is derived rather than set. Each request is identified by its deps
 * and a reload counter, and the screen is loading until a result for the
 * current identity has settled. This used to call setLoading(true) and
 * setError(null) synchronously inside the effect, which renders twice for
 * every request; now state changes only when a request settles. The previous
 * data stays on screen while a reload runs, and an old error is not shown for
 * a request that has not answered yet.
 *
 * deps should be primitives, as every caller's are: they are compared by value.
 */
export function useAsync<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = []
): AsyncState<T> {
  const [nonce, setNonce] = useState(0);
  const key = JSON.stringify([...deps, nonce]);

  const [settled, setSettled] = useState<{ key: string | null; data: T | null; error: string | null }>({
    key: null,
    data: null,
    error: null,
  });

  useEffect(() => {
    let live = true;

    fetcher()
      .then((result) => {
        if (live) setSettled({ key, data: result, error: null });
      })
      .catch((err: unknown) => {
        if (!live) return;
        setSettled((prev) => ({
          key,
          data: prev.data,
          error: err instanceof ApiError ? err.message : "Something went wrong.",
        }));
      });

    return () => {
      live = false;
    };
    // The fetcher is a fresh closure every render; the key is what identifies
    // the request, and it already covers deps and reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const current = settled.key === key;

  return {
    data: settled.data,
    loading: !current,
    error: current ? settled.error : null,
    reload,
  };
}
