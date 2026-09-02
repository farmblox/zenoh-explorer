/**
 * What the palette can do, built from the registries that already exist.
 *
 * Views come from `VIEWS` and key combos from `SHORTCUTS`, for the reason
 * `shortcuts.ts` gives about its own list: a palette with a hand-written copy
 * of either would eventually offer a view that was renamed or print a key that
 * stopped working, and nothing would fail — the list would just quietly lie.
 */
import { SHORTCUTS } from "@/app/shortcuts";
import type { ViewId } from "@/navigation/types";
import { VIEWS } from "@/navigation/views";
import type { ThemePreference } from "@/stores";

/** What running a command does. Interpreted by the palette, not stored. */
export type PaletteAction =
  | { readonly kind: "view"; readonly view: ViewId }
  | { readonly kind: "overlay"; readonly overlay: "connect" | "settings" }
  | { readonly kind: "sidebar" }
  | { readonly kind: "resync" }
  | { readonly kind: "theme"; readonly theme: ThemePreference };

export interface PaletteCommand {
  readonly id: string;
  /** What the row says. Also the string the matcher scores. */
  readonly label: string;
  /** The line under it, in the vocabulary of what it opens. */
  readonly detail: string;
  /** Combo in `mod+k` form, when one is bound. */
  readonly combo?: string;
  readonly action: PaletteAction;
}

/** The state the list depends on, so the labels describe what will happen. */
export interface PaletteContext {
  readonly hasSession: boolean;
  readonly sidebarCollapsed: boolean;
  readonly themePreference: ThemePreference;
}

/** The combo bound to a shortcut id, if any. */
function comboFor(id: string): string | undefined {
  return SHORTCUTS.find((shortcut) => shortcut.id === id)?.combo;
}

/**
 * Every command available right now.
 *
 * Filtered by context rather than shown disabled: a palette is a list of things
 * you can do, and a row that cannot be run is a row you have to read to find
 * that out.
 */
export function buildCommands(context: PaletteContext): PaletteCommand[] {
  const commands: PaletteCommand[] = [];

  for (const view of VIEWS) {
    if (view.requiresSession !== false && !context.hasSession) continue;

    const combo = comboFor(`view:${view.id}`);
    commands.push({
      id: `view:${view.id}`,
      label: `Go to ${view.label}`,
      detail: view.description,
      ...(combo === undefined ? {} : { combo }),
      action: { kind: "view", view: view.id },
    });
  }

  commands.push({
    id: "connect",
    label: "Connect to a network",
    detail: "Open a session against a router or peer",
    ...(comboFor("connect") === undefined ? {} : { combo: comboFor("connect") as string }),
    action: { kind: "overlay", overlay: "connect" },
  });

  commands.push({
    id: "settings",
    label: "Open settings",
    detail: "Appearance, saved connections and keyboard shortcuts",
    ...(comboFor("settings") === undefined ? {} : { combo: comboFor("settings") as string }),
    action: { kind: "overlay", overlay: "settings" },
  });

  commands.push({
    id: "sidebar",
    // Names the outcome, not the control: after running it the sidebar is
    // collapsed, so while it is expanded the row has to say "Collapse".
    label: context.sidebarCollapsed ? "Expand the sidebar" : "Collapse the sidebar",
    detail: "Show or hide the view list",
    ...(comboFor("sidebar") === undefined ? {} : { combo: comboFor("sidebar") as string }),
    action: { kind: "sidebar" },
  });

  if (context.hasSession) {
    commands.push({
      id: "resync",
      label: "Re-read the network",
      detail: "Query the admin space again from scratch",
      ...(comboFor("resync") === undefined ? {} : { combo: comboFor("resync") as string }),
      action: { kind: "resync" },
    });
  }

  for (const theme of ["light", "dark", "system"] as const) {
    if (theme === context.themePreference) continue;
    commands.push({
      id: `theme:${theme}`,
      label: theme === "system" ? "Match the system theme" : `Switch to the ${theme} theme`,
      detail: "Appearance",
      action: { kind: "theme", theme },
    });
  }

  return commands;
}
