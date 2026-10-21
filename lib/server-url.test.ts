import { describe, expect, it, vi } from "vitest";

// Only the address cleanup is under test: stub what the module reaches for at import time.
vi.mock("drizzle-orm", () => ({ eq: () => null }));
vi.mock("@/lib/db", () => ({ db: () => ({}) }));
vi.mock("@/lib/db/schema", () => ({ instanceSettings: {} }));
vi.mock("@/lib/env", () => ({ jellyfinUrl: () => "http://default.example:8096" }));
vi.mock("@/lib/session", () => ({ readPendingServer: async () => null }));

const { normalizeServerUrl } = await import("./server-url");

describe("normalizeServerUrl", () => {
  it.each([
    ["192.168.1.5:8096", "http://192.168.1.5:8096"],
    ["  jf.example.com  ", "http://jf.example.com"],
    ["https://jf.example.com/", "https://jf.example.com"],
    ["https://jf.example.com/jellyfin//", "https://jf.example.com/jellyfin"],
    ["HTTP://Jf.Example.com:8096", "http://jf.example.com:8096"],
  ])("cleans up %s", (input, expected) => {
    expect(normalizeServerUrl(input)).toEqual({ ok: true, url: expected });
  });

  it.each([
    ["nothing", ""],
    ["only spaces", "   "],
    ["a different protocol", "ftp://files.example.com"],
    ["a file path", "file:///etc/passwd"],
    ["credentials in the address", "http://admin:hunter2@jf.example.com"],
    ["a link-local address (cloud metadata)", "http://169.254.169.254/latest/meta-data"],
    ["the metadata hostname", "http://metadata.google.internal"],
    ["an unspecified address", "http://0.0.0.0:8096"],
    ["something too long", `http://${"a".repeat(300)}.example.com`],
    ["text that isn't an address", "http://exa mple"],
  ])("rejects %s", (_label, input) => {
    expect(normalizeServerUrl(input).ok).toBe(false);
  });
});
