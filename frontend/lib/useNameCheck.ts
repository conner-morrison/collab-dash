"use client";

import { useEffect, useState } from "react";
import { api } from "./api";

/**
 * Debounced check of whether a display name is taken.
 * Pass `original` (the user's current name) to avoid warning on their own name.
 */
export function useNameCheck(name: string, original?: string) {
  const [taken, setTaken] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  useEffect(() => {
    const n = name.trim();
    if (!n || n === (original ?? "").trim()) {
      setTaken(false);
      setSuggestion(null);
      return;
    }
    let active = true;
    const t = setTimeout(async () => {
      try {
        const res = await api<{ available: boolean; suggestion: string | null }>(
          `/api/users/check-name?name=${encodeURIComponent(n)}`
        );
        if (!active) return;
        setTaken(!res.available);
        setSuggestion(res.suggestion);
      } catch {
        /* ignore transient errors */
      }
    }, 350);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [name, original]);

  return { taken, suggestion };
}
