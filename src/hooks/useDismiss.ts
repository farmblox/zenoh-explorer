import { useEffect, type RefObject } from "react";

/**
 * Closes a transient layer on Escape or a click outside it.
 *
 * Both halves belong together: a popover that closes on one but not the other
 * is a popover you can get stuck behind. Listening in the capture phase means
 * the layer closes before the click lands on whatever is underneath, so a
 * single click never both dismisses a menu and activates something else.
 */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onDismiss: () => void,
): void {
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && ref.current?.contains(target)) return;
      onDismiss();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onDismiss();
      }
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [ref, open, onDismiss]);
}
