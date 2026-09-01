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

/**
 * State changes: front-loaded on arrival, eased on the way out.
 *
 * The CURVE does the work here, not the duration. `--ease-out` is
 * `cubic-bezier(0.16, 1, 0.3, 1)`, which puts about 85% of the change in the
 * first quarter of the time — so a 150ms arrival is perceptually complete in
 * around 35ms and still has 100ms of visible settle after it. That is what
 * makes a control feel both immediate and alive. A linear 130ms fade managed
 * neither: a pointer crossing a control in 40ms never got a third of the way to
 * the hover colour, so the control read as dead, and killing the duration
 * outright traded that for a hard snap with no motion in it at all.
 *
 * Leaving is slower and evenly eased, because a swept row of controls all
 * snapping back at once strobes.
 *
 * `transform` is in the list so a control can move as well as change colour —
 * see `pressMotion`. Nothing MOVES on hover, though: a row that slides under the
 * pointer takes its own label with it, and text that shifts as you pass over it
 * reads as the app wobbling rather than responding. Hover is colour only.
 *
 * `box-shadow` is deliberately NOT in the list: it is the most expensive of
 * these to interpolate, and the only thing using it is the focus ring, which
 * should arrive instantly because a focus ring that fades in is one you have
 * already started typing past.
 */
export const transitionFast = cn(
  "transition-[background-color,color,border-color,transform]",
  "duration-(--duration-fast) ease-(--ease-standard)",
  "hover:duration-(--duration-snap) hover:ease-(--ease-out)",
  "active:duration-(--duration-snap) active:ease-(--ease-out)",
);

/**
 * A control that gives under the pointer.
 *
 * Two per cent, which is enough to feel and not enough to see. Opt-in rather
 * than part of `transitionFast`, because it belongs on things shaped like
 * buttons and not on table rows — a row that shrinks when you click it drags
 * its neighbours' text with it.
 *
 * `motion-safe` so a reduced-motion preference gets the colour change alone.
 */
export const pressMotion = "motion-safe:active:scale-[0.98]";

/**
 * The focus ring. One of them, for every surface.
 *
 * An outline with an offset, so the gap between the control and the ring shows
 * whatever is ACTUALLY behind it. There used to be two rings, each a
 * double box-shadow whose inner layer named a fixed surface — which is only
 * correct where the control happens to sit on that exact surface. With three
 * surfaces in play and two variants, a control on a card drew a 2px band of the
 * wrong grey around itself.
 *
 * Outline follows `border-radius` in every engine this ships on, and costs no
 * layout, so the reason the ring was a shadow in the first place has expired.
 *
 * `focus-visible` only: a pointer click should not leave a ring behind.
 */
export const focusRing = cn(
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
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

/**
 * A draggable divider — a panel edge or a column boundary.
 *
 * The hit area is nine pixels and the line inside it is one. Grabbing a
 * one-pixel target is the difference between a resizable thing and a thing that
 * is technically resizable, and the two places this appears have to feel the
 * same or one of them feels broken.
 */
export const resizeHandle = cn(
  "absolute top-0 bottom-0 z-20 w-[9px] cursor-col-resize focus-visible:outline-none",
  "after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2",
  "after:transition-[background-color] after:duration-(--duration-fast)",
);

/** The divider's line, at rest and while being dragged. */
export const resizeHandleLine = {
  idle: "after:bg-transparent hover:after:bg-accent/60 focus-visible:after:bg-accent",
  active: "after:bg-accent",
} as const;

/** Everything an interactive control shares. */
export const controlBase = cn(transitionFast, focusRing, "tracking-ui");
