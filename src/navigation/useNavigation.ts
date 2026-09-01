import { useCallback } from "react";

import { useSessionStore, useUiStore } from "@/stores";
import { VIEW_BY_ID } from "./views";
import type { ViewDefinition, ViewId } from "./types";

export interface Navigation {
  /** The view currently showing. */
  readonly view: ViewId;
  /** Its definition, for the header and the outlet. */
  readonly definition: ViewDefinition;
  /** Switches view within the active session. */
  readonly navigate: (view: ViewId) => void;
}

/** Fallback when no session is open — the view that helps you find one. */
const SESSIONLESS_VIEW: ViewId = "scouting";

/**
 * Reads and changes the active view.
 *
 * View state is per session, so switching tabs returns you to wherever you
 * were in that tab. When no session is open the choice is constrained to the
 * views that work without one.
 */
export function useNavigation(): Navigation {
  const activeId = useSessionStore((state) => state.activeId);
  const viewBySession = useUiStore((state) => state.viewBySession);
  const fallbackView = useUiStore((state) => state.fallbackView);
  const setView = useUiStore((state) => state.setView);

  const stored = activeId ? (viewBySession[activeId] ?? "topology") : fallbackView;
  const candidate = VIEW_BY_ID.get(stored);

  // Guard both ways: an unknown id (a stale persisted value) and a view that
  // needs a session when none is open.
  const definition =
    candidate && (activeId !== null || candidate.requiresSession === false)
      ? candidate
      : // Every branch resolves — SESSIONLESS_VIEW is always in the registry.
        (VIEW_BY_ID.get(SESSIONLESS_VIEW) as ViewDefinition);

  const navigate = useCallback((view: ViewId) => setView(activeId, view), [activeId, setView]);

  return { view: definition.id, definition, navigate };
}
