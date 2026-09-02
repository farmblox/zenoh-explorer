import { useCallback, useEffect, useState, type RefObject } from "react";

export interface Anchored {
  /** Where the anchor was when it was last measured. */
  readonly rect: DOMRect | null;
  /** Where to portal the layer so it is neither clipped nor buried. */
  readonly host: HTMLElement | null;
  /** Re-read the anchor's position. Call as the layer opens. */
  readonly measure: () => void;
  /** Forget it, so a stale position cannot be rendered. */
  readonly forget: () => void;
}

/**
 * Where to put a floating layer, and where to render it.
 *
 * Two problems, both of which have caught this app out. A layer positioned
 * inside its anchor is clipped by anything between them that hides its
 * overflow — the nav rail does, a dialog does. And a layer portalled to
 * `document.body` from inside a `<dialog>` renders *behind* it, because
 * `showModal()` puts the dialog in the browser's top layer and the top layer is
 * above every normal-flow element whatever its z-index.
 *
 * So the host is the nearest open dialog when there is one and the body
 * otherwise, and the position is measured from the anchor rather than inherited
 * from it. Resolved per open, because the same control gets used in both places.
 */
export function useAnchored(anchor: RefObject<HTMLElement | null>): Anchored {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);

  const measure = useCallback(() => {
    const element = anchor.current;
    setRect(element?.getBoundingClientRect() ?? null);
    setHost(element?.closest("dialog") ?? document.body);
  }, [anchor]);

  const forget = useCallback(() => setRect(null), []);

  // A measured position goes stale the moment anything moves, and a layer that
  // has drifted from what it describes is worse than no layer.
  useEffect(() => {
    if (rect === null) return;

    const remeasure = () => measure();
    window.addEventListener("scroll", remeasure, true);
    window.addEventListener("resize", remeasure);
    return () => {
      window.removeEventListener("scroll", remeasure, true);
      window.removeEventListener("resize", remeasure);
    };
  }, [rect, measure]);

  return { rect, host, measure, forget };
}
