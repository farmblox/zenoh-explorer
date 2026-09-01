import type { ViewId } from "@/navigation/types";

/** Everything a shortcut can be bound to. */
export type ShortcutId =
  "palette" | "connect" | "settings" | "sidebar" | "resync" | "close" | `view:${ViewId}`;

export interface ShortcutSpec {
  readonly id: ShortcutId;
  /** The combo, in the notation `useHotkeys` parses. `mod` is ⌘ or Ctrl. */
  readonly combo: string;
  /** What it does, from the reader's side. */
  readonly label: string;
  readonly group: "Global" | "Go to";
  /** Fires even while a text field has focus. */
  readonly allowInInput?: boolean;
}

/**
 * The keyboard map, once.
 *
 * This is the list the app BINDS and the list Settings prints. Keeping them
 * apart is how a shortcuts screen ends up advertising a key that stopped
 * working three releases ago: nothing fails, the page just quietly lies. Here a
 * combo that is not bound cannot appear, and one that is bound cannot be
 * missing, because there is only the one array.
 */
export const SHORTCUTS: readonly ShortcutSpec[] = [
  {
    id: "palette",
    combo: "mod+k",
    label: "Search or run a command",
    group: "Global",
    allowInInput: true,
  },
  { id: "connect", combo: "mod+n", label: "Connect to a network", group: "Global" },
  { id: "settings", combo: "mod+,", label: "Settings", group: "Global" },
  { id: "sidebar", combo: "mod+b", label: "Collapse the sidebar", group: "Global" },
  { id: "resync", combo: "mod+r", label: "Re-read the network", group: "Global" },
  {
    id: "close",
    combo: "escape",
    label: "Close what is open",
    group: "Global",
    allowInInput: true,
  },

  { id: "view:topology", combo: "mod+1", label: "Topology", group: "Go to" },
  { id: "view:nodes", combo: "mod+2", label: "Nodes", group: "Go to" },
  { id: "view:keyspace", combo: "mod+3", label: "Keyspace", group: "Go to" },
];

/** The groups in the order they should be read. */
export const SHORTCUT_GROUPS = ["Global", "Go to"] as const;
