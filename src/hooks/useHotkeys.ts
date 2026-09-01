import { useEffect } from "react";

/** A binding: a key description and what it does. */
export interface Hotkey {
  /**
   * Combination in `mod+shift+k` form. `mod` is Cmd on macOS and Ctrl
   * elsewhere, which is the only portable way to express the primary modifier.
   */
  readonly combo: string;
  readonly handler: (event: KeyboardEvent) => void;
  /** Fire even when a text field has focus. Off by default. */
  readonly allowInInput?: boolean;
}

const IS_APPLE = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? "");

/**
 * Binds keyboard shortcuts for as long as the component is mounted.
 *
 * Bindings are ignored while the user is typing unless `allowInInput` says
 * otherwise — a plain `/` shortcut that fires inside a filter box is a bug, not
 * a feature.
 */
export function useHotkeys(hotkeys: readonly Hotkey[]): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const typing = isTextEntry(event.target);

      for (const hotkey of hotkeys) {
        if (typing && !hotkey.allowInInput) continue;
        if (!matches(hotkey.combo, event)) continue;
        event.preventDefault();
        hotkey.handler(event);
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hotkeys]);
}

/** Whether the event target accepts text. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  );
}

/** Tests one combo against a key event. */
function matches(combo: string, event: KeyboardEvent): boolean {
  const parts = combo.toLowerCase().split("+");
  const key = parts.at(-1) ?? "";

  const wantMod = parts.includes("mod");
  const wantShift = parts.includes("shift");
  const wantAlt = parts.includes("alt");

  const mod = IS_APPLE ? event.metaKey : event.ctrlKey;
  // The non-primary modifier must be *absent*, or `ctrl+k` would also fire a
  // `mod+k` binding on macOS.
  const otherMod = IS_APPLE ? event.ctrlKey : event.metaKey;

  return (
    mod === wantMod &&
    !otherMod &&
    event.shiftKey === wantShift &&
    event.altKey === wantAlt &&
    event.key.toLowerCase() === key
  );
}

/** Renders a combo the way this platform writes it: `⌘K` or `Ctrl+K`. */
export function formatCombo(combo: string): string {
  const parts = combo.split("+");
  const key = parts.at(-1) ?? "";
  const pretty = key.length === 1 ? key.toUpperCase() : capitalise(key);

  if (IS_APPLE) {
    return [
      parts.includes("mod") ? "⌘" : "",
      parts.includes("alt") ? "⌥" : "",
      parts.includes("shift") ? "⇧" : "",
      pretty,
    ].join("");
  }

  return [
    parts.includes("mod") ? "Ctrl" : "",
    parts.includes("alt") ? "Alt" : "",
    parts.includes("shift") ? "Shift" : "",
    pretty,
  ]
    .filter(Boolean)
    .join("+");
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
