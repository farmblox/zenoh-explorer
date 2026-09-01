/**
 * Transient notices.
 *
 * A toast is for something that happened *because the user did something* and
 * that they need to know about now: a connection failed, an export finished. It
 * is not a log — the events view is the log, and anything worth keeping goes
 * there instead of, or as well as, here.
 *
 * Errors do not auto-dismiss. A notice that disappears before it is read is
 * worse than none, because the user knows something happened and cannot find
 * out what.
 */
import { create } from "zustand";

/** How long a non-error toast stays up. */
const DISMISS_AFTER_MS = 5_000;

export type ToastTone = "info" | "success" | "warning" | "error";

/** An action the toast offers, rendered as a button. */
export interface ToastAction {
  readonly label: string;
  readonly onSelect: () => void;
}

export interface Toast {
  readonly id: number;
  readonly tone: ToastTone;
  readonly title: string;
  /** One line of detail. Keep it short; long text belongs in the events view. */
  readonly body?: string | undefined;
  /** Concrete next steps, from the backend's diagnosis where there is one. */
  readonly remedies?: readonly string[] | undefined;
  /** Verbatim underlying error, shown behind a disclosure. */
  readonly detail?: string | undefined;
  readonly action?: ToastAction | undefined;
}

interface ToastState {
  toasts: readonly Toast[];
  /** Raises a toast and returns its id. */
  push(toast: Omit<Toast, "id">): number;
  dismiss(id: number): void;
  clear(): void;
}

let nextId = 0;

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],

  push: (toast) => {
    const id = (nextId += 1);
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));

    // Errors and warnings stay until dismissed: they are the ones carrying
    // instructions, and they are the ones the user will want to re-read.
    if (toast.tone === "info" || toast.tone === "success") {
      setTimeout(() => get().dismiss(id), DISMISS_AFTER_MS);
    }
    return id;
  },

  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/** Raises a toast from anywhere, including outside React. */
export const toast = {
  info: (title: string, body?: string) =>
    useToastStore.getState().push({ tone: "info", title, body }),
  success: (title: string, body?: string) =>
    useToastStore.getState().push({ tone: "success", title, body }),
  warning: (title: string, body?: string) =>
    useToastStore.getState().push({ tone: "warning", title, body }),
  error: (toast: Omit<Toast, "id" | "tone">) =>
    useToastStore.getState().push({ ...toast, tone: "error" }),
};
