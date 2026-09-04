/**
 * Application state.
 *
 * Zustand, one store per concern, no cross-store imports. A store may be read
 * by any feature; a feature's own transient state stays inside the feature.
 *
 * There is no server-state library here on purpose. Almost everything in this
 * app is either push-driven (events and tap channels) or an explicit user
 * action, so a cache with its own invalidation model would be a second source
 * of truth competing with the backend. One-shot reads use `useAsync`.
 */
export { useUiStore, resolveTheme, applyTheme } from "./uiStore";
export type { ThemePreference, ResolvedTheme, Overlay } from "./uiStore";

export { useSessionStore, useActiveSession, useActiveSessionId } from "./sessionStore";
export type { PendingSession } from "./sessionStore";

export { useTopologyStore, useTopology } from "./topologyStore";
export type { TopologyEntry } from "./topologyStore";

export { useTapStore, useTap } from "./tapStore";
export type { TapEntry } from "./tapStore";

export { useToastStore, toast } from "./toastStore";
export type { Toast, ToastTone, ToastAction } from "./toastStore";

export { useDiagnosticsStore } from "./diagnosticsStore";
export type { LogEntry } from "./diagnosticsStore";

export { useLastChange, useLiveEpoch, useLiveStore } from "./liveStore";

export { useUpdateStore } from "./updateStore";
export type { UpdatePhase } from "./updateStore";
