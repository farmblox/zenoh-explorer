import type { ViewGroup } from "./types";

/** Sidebar section headings, in render order. */
export const VIEW_GROUPS: ReadonlyArray<{ id: ViewGroup; label: string }> = [
  { id: "explore", label: "Explore" },
  { id: "data", label: "Data" },
  { id: "activity", label: "Activity" },
  { id: "session", label: "Session" },
];
