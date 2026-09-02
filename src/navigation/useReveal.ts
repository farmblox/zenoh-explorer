import { useEffect } from "react";

import { useUiStore } from "@/stores";
import type { ViewId } from "./types";

/**
 * Selects whatever the palette sent this view to.
 *
 * A view owns its own selection — which node row is open, which key is
 * highlighted — so the palette cannot set it directly. It leaves the request in
 * the store instead and the destination picks it up here, once, on arrival.
 *
 * `apply` must be stable, or the effect re-runs and re-selects on every render.
 * A `useState` setter already is; anything else wants `useCallback`.
 */
export function useReveal(view: ViewId, apply: (target: string) => void): void {
  const reveal = useUiStore((state) => state.reveal);
  const clearReveal = useUiStore((state) => state.clearReveal);

  useEffect(() => {
    if (reveal?.view !== view) return;
    apply(reveal.target);
    clearReveal();
  }, [reveal, view, apply, clearReveal]);
}
