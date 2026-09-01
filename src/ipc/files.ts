/**
 * File pickers.
 *
 * Lives in the IPC layer because it talks to Tauri's dialog plugin, and that
 * import is confined here by the same rule as every other backend call.
 */
import { open } from "@tauri-apps/plugin-dialog";

/**
 * Asks for one PEM file and returns its path, or `null` if cancelled.
 *
 * Returns the path rather than the contents on purpose: Zenoh opens
 * certificates itself, so key material never has to cross into the webview.
 */
export async function pickCertificate(title: string): Promise<string | null> {
  const selected = await open({
    title,
    multiple: false,
    directory: false,
    filters: [
      { name: "Certificates and keys", extensions: ["pem", "crt", "cer", "key", "der"] },
      { name: "All files", extensions: ["*"] },
    ],
  });

  // The plugin returns a string, an array when `multiple`, or null.
  return typeof selected === "string" ? selected : null;
}
