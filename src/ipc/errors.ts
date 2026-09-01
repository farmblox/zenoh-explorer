/**
 * Normalising errors that cross the IPC boundary.
 *
 * Every plugin command serialises failures as `CommandError` (see
 * `tauri-plugin-zenoh-session/src/error.rs`). Tauri rejects the promise with
 * that object, not with an `Error`, so `catch (e)` gives you a plain value with
 * no stack and no `instanceof` support. This module turns whatever arrives back
 * into something typed.
 */
import type { CommandError } from "./generated/CommandError";

export type { CommandError };

/** Discriminants the backend can return. Kept in sync with `Error::code`. */
export type CommandErrorCode = CommandError["code"];

/** An IPC failure, as a real `Error` with the backend's diagnosis attached. */
export class IpcError extends Error {
  readonly code: string;
  /** Concrete next steps, when the backend recognised the failure. */
  readonly remedies: readonly string[];
  /** The underlying transport error, kept so nothing is hidden. */
  readonly detail: string | undefined;

  constructor(code: string, message: string, remedies: readonly string[] = [], detail?: string) {
    super(message);
    this.name = "IpcError";
    this.code = code;
    this.remedies = remedies;
    this.detail = detail;
  }

  /** `true` when the session this command targeted is no longer open. */
  get isStaleSession(): boolean {
    return this.code === "unknownSession";
  }
}

/** Type guard for the shape the backend sends. */
function isCommandError(value: unknown): value is CommandError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "message" in value &&
    typeof (value as CommandError).message === "string"
  );
}

/**
 * Converts anything thrown by `invoke` into an {@link IpcError}.
 *
 * Handles the three shapes that actually occur: our `CommandError`, a bare
 * string (Tauri's own permission and deserialisation failures), and a genuine
 * JS `Error` from the bridge itself.
 */
export function toIpcError(thrown: unknown): IpcError {
  if (thrown instanceof IpcError) return thrown;
  if (isCommandError(thrown)) {
    return new IpcError(
      thrown.code,
      thrown.message,
      thrown.remedies ?? [],
      thrown.detail ?? undefined,
    );
  }
  if (typeof thrown === "string") return new IpcError("tauri", thrown);
  if (thrown instanceof Error) return new IpcError("bridge", thrown.message);
  return new IpcError("unknown", String(thrown));
}
