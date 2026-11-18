import { useEffect, useRef, useState, type ReactNode } from "react";
import { ALL_FLAGS_OFF, parseFeaturesResponse, type Features } from "./features-schema";
import { FeaturesContext } from "./use-features";

export const FEATURES_TIMEOUT_MS = 3000;

/**
 * Renders children at once with every flag off, then requests /api/features once.
 * Any failure (non-2xx, timeout, network error, invalid body) keeps every flag off.
 * Flags come only from that response: never from the URL, local storage or a build variable.
 */
export function FeaturesProvider({ children }: { children: ReactNode }) {
  const [features, setFeatures] = useState<Features>(ALL_FLAGS_OFF);
  const requested = useRef(false);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FEATURES_TIMEOUT_MS);
    void (async () => {
      try {
        const response = await fetch("/api/features", { signal: controller.signal });
        if (!response.ok) return;
        const parsed = parseFeaturesResponse(await response.json());
        if (parsed) setFeatures(parsed);
      } catch {
        // Timeout, network error or unreadable body: flags stay off.
      } finally {
        clearTimeout(timer);
      }
    })();
  }, []);

  return <FeaturesContext.Provider value={features}>{children}</FeaturesContext.Provider>;
}
