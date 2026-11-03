import { beforeEach, describe, expect, it, vi } from "vitest";

// The saved overrides live in one settings row; keep it in memory.
let row: { value: string } | undefined;
vi.mock("drizzle-orm", () => ({ eq: () => null }));
vi.mock("@/lib/db/schema", () => ({ instanceSettings: {} }));
vi.mock("@/lib/db", () => ({
  db: () => ({
    select: () => ({ from: () => ({ where: () => ({ get: () => row }) }) }),
    insert: () => ({
      values: (v: { value: string }) => ({
        onConflictDoUpdate: () => ({
          run: () => {
            row = { value: v.value };
          },
        }),
      }),
    }),
  }),
}));

const calls: { path: string; method?: string; body?: unknown }[] = [];
let users: { id: number; jellyfinUserId: string | null; displayName: string }[] = [];
let importOk = true;
vi.mock("./client", () => ({
  seerrCall: vi.fn(async (_c: unknown, path: string, opts: { method?: string; body?: { jellyfinUserIds: string[] } } = {}) => {
    calls.push({ path, method: opts.method, body: opts.body });
    if (path.startsWith("/user?")) return { status: 200, data: { results: users } };
    if (path === "/user/import-from-jellyfin") {
      if (!importOk) return { status: 500, data: null };
      users.push({ id: 99, jellyfinUserId: opts.body!.jellyfinUserIds[0], displayName: "imported" });
      return { status: 201, data: [] };
    }
    return { status: 404, data: null };
  }),
}));

const { getOverrides, normalizeJellyfinId, resolveSeerrUser, setOverride } = await import("./link");
const config = { url: "http://seerr.test", apiKey: "k" };
const JF = "a1b2c3d4e5f647488a9b0c1d2e3f4a5b";

beforeEach(() => {
  row = undefined;
  calls.length = 0;
  users = [];
  importOk = true;
  setOverride(JF, null); // also clears the lookup cache between tests
  row = undefined;
});

describe("normalizeJellyfinId", () => {
  it("ignores dashes and case", () => {
    expect(normalizeJellyfinId("A1B2C3D4-E5F6-4748-8A9B-0C1D2E3F4A5B")).toBe(JF);
  });
});

describe("resolveSeerrUser", () => {
  it("links automatically by Jellyfin id, however it is written", async () => {
    users = [{ id: 1, jellyfinUserId: "A1B2C3D4-E5F6-4748-8A9B-0C1D2E3F4A5B", displayName: "demo" }];
    expect(await resolveSeerrUser(config, JF)).toEqual({ ok: true, seerrUserId: 1 });
    expect(calls.some((c) => c.path === "/user/import-from-jellyfin")).toBe(false);
  });

  it("imports the person from Jellyfin when Seerr doesn't know them", async () => {
    expect(await resolveSeerrUser(config, JF)).toEqual({ ok: true, seerrUserId: 99 });
    expect(calls.find((c) => c.path === "/user/import-from-jellyfin")?.body).toEqual({ jellyfinUserIds: [JF] });
  });

  it("says there is no account when the import fails", async () => {
    importOk = false;
    expect(await resolveSeerrUser(config, JF)).toEqual({ ok: false, error: "no_account" });
  });

  it("an administrator's choice wins over the match and asks Seerr nothing", async () => {
    users = [{ id: 1, jellyfinUserId: JF, displayName: "demo" }];
    setOverride(JF, 7);
    expect(await resolveSeerrUser(config, JF)).toEqual({ ok: true, seerrUserId: 7 });
    expect(calls).toHaveLength(0);
  });

  it("going back to automatic uses the match again", async () => {
    users = [{ id: 1, jellyfinUserId: JF, displayName: "demo" }];
    setOverride(JF, 7);
    setOverride(JF, null);
    expect(await resolveSeerrUser(config, JF)).toEqual({ ok: true, seerrUserId: 1 });
  });

  it("remembers a match for a while instead of listing users every time", async () => {
    users = [{ id: 1, jellyfinUserId: JF, displayName: "demo" }];
    await resolveSeerrUser(config, JF);
    const first = calls.length;
    await resolveSeerrUser(config, JF);
    expect(calls.length).toBe(first);
  });
});

describe("overrides", () => {
  it("are stored per person and ignore damaged values", () => {
    setOverride("A1B2C3D4-E5F6-4748-8A9B-0C1D2E3F4A5B", 3);
    expect(getOverrides()).toEqual({ [JF]: 3 });
    row = { value: "not json" };
    expect(getOverrides()).toEqual({});
    row = { value: JSON.stringify({ [JF]: "x", other: -1, good: 4 }) };
    expect(getOverrides()).toEqual({ good: 4 });
  });
});
