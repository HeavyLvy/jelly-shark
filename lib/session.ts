import "server-only";
import { cookies } from "next/headers";
import { sealData, unsealData } from "iron-session";
import {
  DEVICE_COOKIE,
  DEVICE_COOKIE_MAX_AGE,
  QUICK_CONNECT_COOKIE,
  QUICK_CONNECT_MAX_AGE,
  SERVER_COOKIE,
  SERVER_COOKIE_MAX_AGE,
  SESSION_COOKIE,
  SESSION_COOKIE_MAX_AGE,
  isValidDeviceId,
} from "@/lib/constants";
import { sessionSecret } from "@/lib/env";

/** One signed-in Jellyfin user on this browser. */
export interface Account {
  userId: string;
  name: string;
  token: string;
  primaryImageTag: string | null;
  /** DeviceId the token is bound to (per account; see lib/jellyfin/device.ts). */
  deviceId: string;
  /**
   * The Jellyfin server this account signed in to, when it isn't the instance
   * default (only possible while the admin lets users choose). Undefined means
   * "whatever the instance default is".
   */
  serverUrl?: string;
}

/** Contents of the sealed `jf_session` cookie. Never sent to client JS. */
export interface Session {
  accounts: Account[];
  activeUserId: string;
}

/** The parts of an account that are safe to expose to the browser. */
export interface PublicAccount {
  userId: string;
  name: string;
  primaryImageTag: string | null;
}

const baseCookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  // LAN-only over plain HTTP; flip on if served over HTTPS.
  secure: false,
};

function isSession(value: unknown): value is Session {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<Session>;
  return (
    Array.isArray(v.accounts) &&
    typeof v.activeUserId === "string" &&
    v.accounts.every(
      (a) =>
        typeof a === "object" &&
        a !== null &&
        typeof a.userId === "string" &&
        typeof a.token === "string" &&
        typeof a.name === "string" &&
        typeof a.deviceId === "string",
    )
  );
}

export async function unsealSession(sealed: string | undefined): Promise<Session | null> {
  if (!sealed) return null;
  try {
    const data = await unsealData<unknown>(sealed, {
      password: sessionSecret(),
      ttl: SESSION_COOKIE_MAX_AGE,
    });
    return isSession(data) && data.accounts.length > 0 ? data : null;
  } catch {
    return null;
  }
}

export async function readSession(): Promise<Session | null> {
  const store = await cookies();
  return unsealSession(store.get(SESSION_COOKIE)?.value);
}

/** Persists the session, or clears the cookie when there are no accounts left. */
export async function writeSession(session: Session | null): Promise<void> {
  const store = await cookies();
  if (!session || session.accounts.length === 0) {
    store.delete(SESSION_COOKIE);
    return;
  }
  const sealed = await sealData(session, {
    password: sessionSecret(),
    ttl: SESSION_COOKIE_MAX_AGE,
  });
  store.set(SESSION_COOKIE, sealed, { ...baseCookie, maxAge: SESSION_COOKIE_MAX_AGE });
}

export function activeAccount(session: Session): Account | undefined {
  return session.accounts.find((a) => a.userId === session.activeUserId) ?? session.accounts[0];
}

/** Adds (or refreshes) an account and makes it the active one. */
export function upsertAccount(session: Session | null, account: Account): Session {
  const others = (session?.accounts ?? []).filter((a) => a.userId !== account.userId);
  return { accounts: [account, ...others], activeUserId: account.userId };
}

export function removeAccount(session: Session, userId: string): Session | null {
  const accounts = session.accounts.filter((a) => a.userId !== userId);
  if (accounts.length === 0) return null;
  const activeUserId =
    session.activeUserId === userId ? accounts[0].userId : session.activeUserId;
  return { accounts, activeUserId };
}

export function toPublicAccount(a: Account): PublicAccount {
  return { userId: a.userId, name: a.name, primaryImageTag: a.primaryImageTag };
}

/**
 * Returns this browser's stable DeviceId, creating the cookie if proxy.ts
 * has not already done so. Only callable from route handlers / actions.
 */
export async function getOrCreateDeviceId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(DEVICE_COOKIE)?.value;
  if (isValidDeviceId(existing)) return existing;
  const id = crypto.randomUUID();
  store.set(DEVICE_COOKIE, id, { ...baseCookie, maxAge: DEVICE_COOKIE_MAX_AGE });
  return id;
}

/* Quick Connect secret: credential-equivalent, so it lives in its own sealed cookie. */

export interface PendingQuickConnect {
  secret: string;
  /** DeviceId sent with Initiate; the issued token is bound to it. */
  deviceId: string;
  /** The server Initiate was sent to, so polling goes to the same one. */
  serverUrl: string;
}

export async function writeQuickConnect(pending: PendingQuickConnect | null): Promise<void> {
  const store = await cookies();
  if (!pending) {
    store.delete(QUICK_CONNECT_COOKIE);
    return;
  }
  const sealed = await sealData(pending, { password: sessionSecret(), ttl: QUICK_CONNECT_MAX_AGE });
  store.set(QUICK_CONNECT_COOKIE, sealed, { ...baseCookie, maxAge: QUICK_CONNECT_MAX_AGE });
}

export async function readQuickConnect(): Promise<PendingQuickConnect | null> {
  const store = await cookies();
  const sealed = store.get(QUICK_CONNECT_COOKIE)?.value;
  if (!sealed) return null;
  try {
    const data = await unsealData<Partial<PendingQuickConnect>>(sealed, {
      password: sessionSecret(),
      ttl: QUICK_CONNECT_MAX_AGE,
    });
    return typeof data.secret === "string" && typeof data.deviceId === "string" && typeof data.serverUrl === "string"
      ? { secret: data.secret, deviceId: data.deviceId, serverUrl: data.serverUrl }
      : null;
  } catch {
    return null;
  }
}

/* The server address picked on the sign-in screen: sealed, so it can only be one we verified. */

export interface PendingServer {
  url: string;
}

export async function writePendingServer(pending: PendingServer | null): Promise<void> {
  const store = await cookies();
  if (!pending) {
    store.delete(SERVER_COOKIE);
    return;
  }
  const sealed = await sealData(pending, { password: sessionSecret(), ttl: SERVER_COOKIE_MAX_AGE });
  store.set(SERVER_COOKIE, sealed, { ...baseCookie, maxAge: SERVER_COOKIE_MAX_AGE });
}

export async function readPendingServer(): Promise<PendingServer | null> {
  const store = await cookies();
  const sealed = store.get(SERVER_COOKIE)?.value;
  if (!sealed) return null;
  try {
    const data = await unsealData<Partial<PendingServer>>(sealed, { password: sessionSecret(), ttl: SERVER_COOKIE_MAX_AGE });
    return typeof data.url === "string" ? { url: data.url } : null;
  } catch {
    return null;
  }
}
