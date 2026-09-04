/** One signed application update, from discovery through restart. */
import { create } from "zustand";

import { appVersion, findUpdate, installUpdate, toIpcError, type AvailableUpdate } from "@/ipc";

export type UpdatePhase = "idle" | "checking" | "current" | "available" | "installing" | "failed";

interface UpdateState {
  phase: UpdatePhase;
  currentVersion: string | null;
  update: AvailableUpdate | null;
  dialogOpen: boolean;
  downloadedBytes: number;
  totalBytes: number | null;
  error: string | null;

  initialize(): Promise<void>;
  openDialog(): void;
  closeDialog(): void;
  install(): Promise<void>;
}

export const useUpdateStore = create<UpdateState>()((set, get) => ({
  phase: "idle",
  currentVersion: null,
  update: null,
  dialogOpen: false,
  downloadedBytes: 0,
  totalBytes: null,
  error: null,

  initialize: async () => {
    if (get().phase !== "idle") return;
    set({ phase: "checking" });

    let currentVersion: string | null = null;
    try {
      currentVersion = await appVersion();
      set({ currentVersion });
    } catch {
      // Version text is useful chrome, not a reason to fail startup.
    }

    // Dev and WebDriver builds intentionally omit the Rust updater plugin.
    // They still show their version, but never call a command that cannot
    // exist in those builds.
    if (import.meta.env.DEV || import.meta.env.MODE === "e2e") {
      set({
        phase: "current",
        currentVersion,
        error: "Update checks are disabled in this build.",
      });
      return;
    }

    try {
      const update = await findUpdate();
      set({
        phase: update ? "available" : "current",
        currentVersion: update?.currentVersion ?? currentVersion,
        update,
        error: null,
      });
    } catch (thrown) {
      // A networkless launch is normal. Keep the current version visible and
      // try again next launch rather than raising an alarming startup toast.
      set({ phase: "current", currentVersion, error: toIpcError(thrown).message });
    }
  },

  openDialog: () => {
    if (get().update) set({ dialogOpen: true });
  },

  closeDialog: () => {
    if (get().phase !== "installing") set({ dialogOpen: false });
  },

  install: async () => {
    if (!get().update || get().phase === "installing") return;
    set({
      phase: "installing",
      dialogOpen: true,
      downloadedBytes: 0,
      totalBytes: null,
      error: null,
    });

    try {
      await installUpdate(({ downloadedBytes, totalBytes }) => {
        set({ downloadedBytes, totalBytes });
      });
    } catch (thrown) {
      set({ phase: "failed", error: toIpcError(thrown).message });
    }
  },
}));
