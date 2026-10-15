import "server-only";
import { createHash, randomUUID } from "node:crypto";

/**
 * Jellyfin keeps one live session per DeviceId, and /Sessions/Logout ends
 * every session on that DeviceId. Each remembered account therefore gets
 * its own DeviceId, derived from the browser's stable jf_device id, so
 * signing one profile out never disturbs the others.
 */
export function deriveDeviceId(browserDeviceId: string, scope: string): string {
  return createHash("sha256").update(`${browserDeviceId}\u0000${scope}`).digest("hex").slice(0, 32);
}

/** DeviceId for a username/password login (stable per browser + username). */
export function passwordLoginDeviceId(browserDeviceId: string, username: string): string {
  return deriveDeviceId(browserDeviceId, `user:${username.trim().toLowerCase()}`);
}

/** DeviceId for one Quick Connect attempt (the issued token is bound to it). */
export function quickConnectDeviceId(browserDeviceId: string): string {
  return deriveDeviceId(browserDeviceId, `qc:${randomUUID()}`);
}
