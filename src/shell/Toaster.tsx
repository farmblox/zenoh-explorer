import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { focusRing, transitionFast } from "@/lib/states";
import { useToastStore, type Toast, type ToastTone } from "@/stores";

const TONES: Record<ToastTone, { icon: typeof Info; accent: string; iconClass: string }> = {
  info: { icon: Info, accent: "border-l-accent", iconClass: "text-accent" },
  success: { icon: CheckCircle2, accent: "border-l-ok", iconClass: "text-ok" },
  warning: { icon: AlertTriangle, accent: "border-l-warn", iconClass: "text-warn" },
  error: { icon: XCircle, accent: "border-l-danger", iconClass: "text-danger" },
};

/**
 * Transient notices, bottom-right, above the status bar.
 *
 * Errors carry the backend's diagnosis: a summary, the concrete remedies it
 * suggested, and the raw transport error behind a disclosure. That last part
 * matters — the friendly summary is a guess about intent, and someone
 * debugging a TLS handshake needs the actual rustls message.
 */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  if (toasts.length === 0) return null;

  return (
    <div
      // Not `role="alert"`: that interrupts a screen reader mid-sentence. A
      // polite live region announces after the current utterance instead.
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute right-4 bottom-12 z-50 flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function ToastCard({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((state) => state.dismiss);
  const [showDetail, setShowDetail] = useState(false);
  const tone = TONES[toast.tone];
  const Icon = tone.icon;

  return (
    <div
      className={cn(
        "rounded-panel border-line bg-surface-2 pointer-events-auto border border-l-2",
        "shadow-popover animate-[var(--animate-scale-in)] p-3",
        tone.accent,
      )}
    >
      <div className="flex items-start gap-2.5">
        <Icon size={15} className={cn("mt-px shrink-0", tone.iconClass)} />

        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-small text-ink font-medium">{toast.title}</p>
          {toast.body ? <p className="text-tiny text-ink-muted">{toast.body}</p> : null}

          {toast.remedies && toast.remedies.length > 0 ? (
            <ul className="text-tiny text-ink-muted mt-1.5 space-y-1">
              {toast.remedies.map((remedy) => (
                <li key={remedy} className="flex gap-1.5">
                  <span className="text-ink-faint shrink-0">→</span>
                  <span>{remedy}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {toast.detail ? (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowDetail((open) => !open)}
                className={cn(
                  "rounded-inner text-tiny text-ink-faint hover:text-ink",
                  focusRing,
                  transitionFast,
                )}
              >
                {showDetail ? "Hide details" : "Show details"}
              </button>
              {showDetail ? (
                <pre className="scroll-thin selectable numeric text-ink-faint rounded-inner bg-surface-1 text-tiny mt-1.5 max-h-32 overflow-auto p-2 whitespace-pre-wrap">
                  {toast.detail}
                </pre>
              ) : null}
            </div>
          ) : null}

          {toast.action ? (
            <div className="pt-1.5">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  toast.action?.onSelect();
                  dismiss(toast.id);
                }}
              >
                {toast.action.label}
              </Button>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => dismiss(toast.id)}
          aria-label="Dismiss"
          className={cn("text-ink-faint hover:text-ink shrink-0", transitionFast)}
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
