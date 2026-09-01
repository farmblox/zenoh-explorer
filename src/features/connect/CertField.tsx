import { FileKey, FolderOpen, X } from "lucide-react";

import { Badge, Button } from "@/components/ui";
import { pickCertificate } from "@/ipc";
import type { CertSource } from "@/ipc";
import { cn } from "@/lib/cn";
import { transitionFast } from "@/lib/states";

export interface CertFieldProps {
  label: string;
  hint: string;
  value: CertSource | null;
  onChange: (value: CertSource | null) => void;
  /**
   * Marks the field as holding a private key. Only changes how it is labelled —
   * the value is handled identically either way, and the backend redacts inline
   * material before anything is logged.
   */
  secret?: boolean;
}

/**
 * Picks one PEM file for a TLS field.
 *
 * Stores the PATH rather than the contents. Zenoh reads certificates from disk
 * itself, so passing a path means the key material never crosses the IPC
 * boundary, never lands in a Tauri event, and never sits in the webview's
 * memory. The backend supports inline base64 as well, for profiles that have to
 * travel, but a file on this machine should stay a file on this machine.
 */
export function CertField({ label, hint, value, onChange, secret }: CertFieldProps) {
  const choose = async () => {
    const path = await pickCertificate(label);
    if (path) onChange({ kind: "path", value: path });
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-small text-ink font-medium">{label}</span>
        {secret ? <Badge tone="warn">private key</Badge> : null}
        <span className="text-tiny text-ink-faint">{hint}</span>
      </div>

      {value ? (
        <div
          className={cn(
            "rounded-control bg-surface-2 border-line flex h-9 items-center gap-2.5 border px-3",
          )}
        >
          <FileKey size={13} className="text-ink-faint shrink-0" />
          <span
            className="numeric selectable text-tiny text-ink min-w-0 flex-1 truncate"
            title={value.value}
            // The path can be long and the interesting half is the end.
            dir="rtl"
          >
            {value.value}
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={`Clear ${label}`}
            className={cn("text-ink-faint hover:text-ink shrink-0", transitionFast)}
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <Button
          icon={<FolderOpen size={13} />}
          onClick={() => void choose()}
          className="w-full justify-start"
        >
          Choose a file…
        </Button>
      )}
    </div>
  );
}
