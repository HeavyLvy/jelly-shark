import { afterEach, describe, expect, it, vi } from "vitest";
import { verifySeerr } from "./verify";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const STATUS = { version: "3.5.1", commitTag: "abc" };

/** Answers each Seerr path from a table; anything else throws like an unreachable host. */
function fakeSeerr(routes: Record<string, (key: string | null) => Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const path = new URL(input).pathname.replace("/api/v1", "");
      const handler = routes[path];
      if (!handler) throw new Error("ECONNREFUSED");
      return handler(new Headers(init?.headers).get("x-api-key"));
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("verifySeerr", () => {
  it("accepts a Seerr server with an administrator's key", async () => {
    fakeSeerr({ "/status": () => json(STATUS), "/auth/me": () => json({ id: 1, permissions: 2 }) });
    expect(await verifySeerr("http://seerr.test", "k")).toEqual({ ok: true, seerr: { version: "3.5.1" } });
  });

  it("sends the key only to the authenticated route", async () => {
    fakeSeerr({ "/status": (key) => (key ? json({}, 500) : json(STATUS)), "/auth/me": (key) => (key === "k" ? json({ permissions: 2 }) : json({}, 403)) });
    expect((await verifySeerr("http://seerr.test", "k")).ok).toBe(true);
  });

  it("treats the Admin bit as admin even with other permissions set", async () => {
    fakeSeerr({ "/status": () => json(STATUS), "/auth/me": () => json({ permissions: 2 | 32 | 4096 }) });
    expect((await verifySeerr("http://seerr.test", "k")).ok).toBe(true);
  });

  it("refuses an address that isn't Seerr", async () => {
    fakeSeerr({ "/status": () => json({ hello: "world" }) });
    expect(await verifySeerr("http://other.test", "k")).toMatchObject({ ok: false, error: "not_seerr" });
  });

  it("refuses a server with no Seerr API", async () => {
    fakeSeerr({ "/status": () => json({ error: "nope" }, 404) });
    expect(await verifySeerr("http://other.test", "k")).toMatchObject({ ok: false, error: "not_seerr" });
  });

  it("refuses a redirect", async () => {
    fakeSeerr({ "/status": () => new Response(null, { status: 302, headers: { location: "http://elsewhere.test" } }) });
    expect(await verifySeerr("http://seerr.test", "k")).toMatchObject({ ok: false, error: "not_seerr" });
  });

  it("refuses a key Seerr rejects", async () => {
    fakeSeerr({ "/status": () => json(STATUS), "/auth/me": () => json({ message: "Forbidden" }, 403) });
    expect(await verifySeerr("http://seerr.test", "bad")).toMatchObject({ ok: false, error: "bad_key" });
  });

  it("refuses a key that isn't an administrator's", async () => {
    fakeSeerr({ "/status": () => json(STATUS), "/auth/me": () => json({ id: 2, permissions: 32 }) });
    expect(await verifySeerr("http://seerr.test", "k")).toMatchObject({ ok: false, error: "key_not_admin" });
  });

  it("says so when the host can't be reached", async () => {
    fakeSeerr({});
    expect(await verifySeerr("http://nowhere.test", "k")).toMatchObject({ ok: false, error: "unreachable" });
  });
});
