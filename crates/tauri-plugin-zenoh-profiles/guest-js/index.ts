/** TypeScript client for the `zenoh-profiles` plugin. */
import { invoke } from "@tauri-apps/api/core";

import type { ConnectionProfile } from "@/ipc/generated/ConnectionProfile";
import type { SavedProfile } from "@/ipc/generated/SavedProfile";

/** Every saved profile, most recently used first. */
export function listProfiles(): Promise<SavedProfile[]> {
  return invoke("plugin:zenoh-profiles|list_profiles");
}

/**
 * Inserts or updates a profile, returning its id.
 *
 * Pass `id` to update, omit it to create. Rejects a profile carrying inline
 * private key material — reference the key file by path instead.
 */
export function saveProfile(profile: ConnectionProfile, id?: string): Promise<string> {
  return invoke("plugin:zenoh-profiles|save_profile", { id, profile });
}

/** Removes a profile. */
export function deleteProfile(id: string): Promise<void> {
  return invoke("plugin:zenoh-profiles|delete_profile", { id });
}

/** Records a connection, so the profile sorts to the top of the list. */
export function recordConnection(id: string): Promise<void> {
  return invoke("plugin:zenoh-profiles|record_connection", { id });
}
