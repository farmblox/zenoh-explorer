/**
 * The interaction vocabulary.
 *
 * Every control in the app composes its states from these strings rather than
 * spelling them out, so hover feels identical on a button, a sidebar row and a
 * table row — and changing how the whole app responds to a pointer is one edit
 * here instead of thirty.
 *
 * The model is deliberately small:
 *
 *   rest      the surface as it is
 *   hover     a translucent overlay, never a different colour
 *   press     a slightly stronger overlay. No scaling — controls do not squish
 *   focus     a 2px accent ring drawn as a shadow, so focus costs no layout
 *   selected  accent-tinted fill and accent text
 *   disabled  a measured muted colour, pointer events off
 *
 * Hover as an OVERLAY rather than a named colour is what makes it work
 * everywhere: the same rule reads correctly on surface-0 through surface-3
 * without four variants.
 */
import { cn } from "./cn";

/** State changes: fast and linear-feeling. Anything slower reads as lag. */
export const transitionFast =
  "transition-[background-color,color,box-shadow,border-color] duration-(--duration-fast) ease-(--ease-standard)";

/**
 * The focus ring.
 *
 * A box-shadow, not an outline, so it follows the element's border radius and
 * never nudges a neighbour. `focus-visible` only: a pointer click should not
 * leave a ring behind.
 */
export const focusRing = cn(
  "focus-visible:outline-none",
  "focus-visible:shadow-[0_0_0_2px_var(--surface-1),0_0_0_4px_var(--accent)]",
);

/** Focus ring for controls that sit directly on the window chrome. */
export const focusRingOnChrome = cn(
  "focus-visible:outline-none",
  "focus-visible:shadow-[0_0_0_2px_var(--surface-0),0_0_0_4px_var(--accent)]",
);

/** Hover and press overlays, for a control with its own background. */
export const overlayStates = cn(
  "hover:bg-[image:linear-gradient(var(--overlay-hover),var(--overlay-hover))]",
  "active:bg-[image:linear-gradient(var(--overlay-press),var(--overlay-press))]",
);

/** Disabled, for anything that can be. */
export const disabledState =
  "disabled:pointer-events-none disabled:text-ink-disabled disabled:shadow-none";

/**
 * A field's resting, focused and invalid edges.
 *
 * The focus treatment is a coloured 1px border plus a WIDE, translucent halo —
 * never a second 1px ring in the same colour. Two 1px edges of one colour do
 * not stack cleanly on a rounded corner: the border's arc and the shadow's arc
 * have different radii, so the corners render thicker and lighter than the
 * straight edges. A 3px translucent halo reads as a halo and has no edge to
 * misalign.
 *
 * Same geometry as a selected node on the graph canvas, so "this is the focused
 * thing" looks identical wherever it appears.
 */
export const fieldRest = "border-line";
export const fieldFocus =
  "focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--accent-subtle)]";
export const fieldInvalid = "border-danger shadow-[0_0_0_3px_var(--danger-subtle)]";

/** Everything an interactive control shares. */
export const controlBase = cn(transitionFast, focusRing, "tracking-ui");
