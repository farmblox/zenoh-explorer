import { ArrowDownToLine, RefreshCw } from "lucide-react";

import { cn } from "@/lib/cn";
import { bytes } from "@/lib/format";
import { pressable, transitionFast } from "@/lib/states";
import { useUpdateStore } from "@/stores";

/** Global update state, anchored at the far-right edge of the status bar. */
export function UpdateStatus() {
  const phase = useUpdateStore((state) => state.phase);
  const currentVersion = useUpdateStore((state) => state.currentVersion);
  const update = useUpdateStore((state) => state.update);
  const downloadedBytes = useUpdateStore((state) => state.downloadedBytes);
  const totalBytes = useUpdateStore((state) => state.totalBytes);
  const error = useUpdateStore((state) => state.error);
  const openDialog = useUpdateStore((state) => state.openDialog);

  if (!currentVersion && !update) return null;

  const progress = totalBytes ? Math.min(1, downloadedBytes / totalBytes) : null;

  return (
    <>
      <span className="bg-line h-3 w-px shrink-0" aria-hidden />

      {phase === "available" && update ? (
        <button
          type="button"
          onClick={openDialog}
          className={cn(
            "rounded-inner bg-accent-subtle text-accent hover:text-accent-strong",
            "flex h-5 shrink-0 items-center gap-1.5 px-2 font-semibold",
            pressable,
            transitionFast,
          )}
        >
          <ArrowDownToLine size={11} aria-hidden />
          Update {update.version}
        </button>
      ) : phase === "installing" && update ? (
        <button
          type="button"
          onClick={openDialog}
          className={cn(
            "rounded-inner text-accent flex h-5 shrink-0 items-center gap-1.5 px-1.5",
            pressable,
          )}
          aria-label={`Installing Zenoh Explorer ${update.version}`}
        >
          <RefreshCw size={10} className="animate-spin" aria-hidden />
          <span className="numeric">
            {progress === null ? bytes(downloadedBytes) : `${Math.round(progress * 100)}%`}
          </span>
        </button>
      ) : phase === "failed" && update ? (
        <button
          type="button"
          onClick={openDialog}
          title={error ?? "The update could not be installed"}
          className={cn(
            "rounded-inner text-danger hover:text-ink flex h-5 shrink-0 items-center px-1.5",
            pressable,
          )}
        >
          Update failed
        </button>
      ) : (
        <span
          className="numeric text-ink-disabled shrink-0"
          title={
            error
              ? `Zenoh Explorer ${currentVersion ?? ""} · update check unavailable`
              : phase === "checking"
                ? "Checking for a signed update"
                : `Zenoh Explorer ${currentVersion ?? ""} · up to date`
          }
        >
          v{currentVersion}
        </span>
      )}
    </>
  );
}
