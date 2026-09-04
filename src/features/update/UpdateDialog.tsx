import { ArrowDownToLine, ArrowRight, ShieldCheck } from "lucide-react";

import { Badge, Button, Dialog, Meter, SectionLabel, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import { bytes } from "@/lib/format";
import { useUpdateStore } from "@/stores";

/** Confirmation and progress for the signed update advertised in the status bar. */
export function UpdateDialog() {
  const phase = useUpdateStore((state) => state.phase);
  const update = useUpdateStore((state) => state.update);
  const open = useUpdateStore((state) => state.dialogOpen);
  const downloadedBytes = useUpdateStore((state) => state.downloadedBytes);
  const totalBytes = useUpdateStore((state) => state.totalBytes);
  const error = useUpdateStore((state) => state.error);
  const close = useUpdateStore((state) => state.closeDialog);
  const install = useUpdateStore((state) => state.install);

  if (!update) return null;

  const installing = phase === "installing";
  const progress = totalBytes ? Math.min(1, downloadedBytes / totalBytes) : null;
  const progressLabel =
    progress === null ? bytes(downloadedBytes) : `${Math.round(progress * 100)}%`;

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Update Zenoh Explorer"
      className="!w-[540px]"
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={installing}>
            Later
          </Button>
          <span className="flex-1" />
          <Button
            variant="primary"
            icon={<ArrowDownToLine size={13} />}
            loading={installing}
            onClick={() => void install()}
          >
            {installing
              ? `Installing ${progressLabel}`
              : phase === "failed"
                ? "Try again"
                : "Update and restart"}
          </Button>
        </>
      }
    >
      <div className="scroll-thin max-h-[58vh] overflow-y-auto p-5">
        <div className="border-line bg-surface-1 rounded-panel flex items-center gap-4 border p-4">
          <Version value={update.currentVersion} />
          <ArrowRight size={15} className="text-ink-disabled shrink-0" aria-hidden />
          <Version value={update.version} current />
          <Badge tone="accent" className="ml-auto">
            signed
          </Badge>
        </div>

        {installing ? (
          <section className="mt-5">
            <div className="mb-2 flex items-center gap-2.5">
              <Spinner />
              <span className="text-small text-ink font-medium">
                {totalBytes ? "Downloading and verifying" : "Preparing the signed update"}
              </span>
              <span className="numeric text-tiny text-ink-faint ml-auto">{progressLabel}</span>
            </div>
            {progress !== null ? (
              <Meter
                value={progress}
                size="sm"
                label={`Update download ${Math.round(progress * 100)} percent complete`}
              />
            ) : null}
          </section>
        ) : null}

        {error ? (
          <div className="bg-danger-subtle text-danger rounded-panel mt-5 p-3.5">
            <p className="text-small font-medium">The update was not installed</p>
            <p className="text-tiny mt-1 leading-relaxed">{error}</p>
          </div>
        ) : null}

        <section className="mt-5">
          <SectionLabel className="mb-2.5">What changed</SectionLabel>
          <p
            className={cn(
              "text-small leading-relaxed whitespace-pre-wrap",
              update.notes ? "text-ink-muted" : "text-ink-faint",
            )}
          >
            {update.notes?.trim() || "No release notes were included with this update."}
          </p>
        </section>

        <div className="border-line-soft text-tiny text-ink-faint mt-5 flex items-start gap-2.5 border-t pt-4 leading-relaxed">
          <ShieldCheck size={14} className="text-ok mt-px shrink-0" aria-hidden />
          <p>
            The package signature is verified before installation. Open Zenoh sessions close when
            the app restarts.
          </p>
        </div>
      </div>
    </Dialog>
  );
}

function Version({ value, current = false }: { value: string; current?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-micro text-ink-faint font-semibold tracking-wide uppercase">
        {current ? "available" : "installed"}
      </p>
      <p
        className={cn(
          "numeric mt-0.5 text-base font-semibold",
          current ? "text-accent" : "text-ink",
        )}
      >
        v{value}
      </p>
    </div>
  );
}
