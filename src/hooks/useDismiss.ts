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
  ref: RefObject<HTMLElement | null> | readonly RefObject<HTMLElement | null>[],
  open: boolean,
  onDismiss: () => void,
): void {
  useEffect(() => {
    if (!open) return;

    // A list, because a layer's parts need not share a parent: a panel
    // rendered into `document.body` is nowhere near the trigger that opened
    // it, and a click inside it would otherwise count as a click outside.
    // `"current" in ref` rather than `Array.isArray`, which widens a readonly
    // array to `any[]` and loses the element type with it.
    const inside = "current" in ref ? [ref] : ref;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && inside.some((part) => part.current?.contains(target))) return;
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
