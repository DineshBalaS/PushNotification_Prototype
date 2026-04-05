"use client";

import { useEffect } from "react";
import { fetchHealth } from "@/lib/api";

/**
 * Development-only: one silent request to GET /health so you can confirm
 * NEXT_PUBLIC_API_BASE_URL in the browser console (Task 3).
 */
export function DevApiHealthProbe() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchHealth();
        if (!cancelled) {
          console.debug("[api] health probe OK", data);
        }
      } catch (e) {
        if (!cancelled) {
          console.warn("[api] health probe failed (is the backend up and NEXT_PUBLIC_API_BASE_URL set?)", e);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
