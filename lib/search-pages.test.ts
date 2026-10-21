import { describe, expect, it } from "vitest";
import { APP_PAGES, matchPages } from "./search-pages";

describe("matchPages", () => {
  it("finds pages by name and by keyword", () => {
    expect(matchPages("settings", false)[0]?.id).toBe("settings");
    expect(matchPages("hotkeys", false)[0]?.id).toBe("shortcuts");
    expect(matchPages("quick connect", false).map((p) => p.id)).toContain("approve");
    expect(matchPages("add to home screen", false).map((p) => p.id)).toContain("install");
  });
  it("tolerates typos", () => {
    expect(matchPages("histry", false).map((p) => p.id)).toContain("history");
  });
  it("keeps admin-only pages away from everyone else", () => {
    expect(matchPages("branding", false).map((p) => p.id)).not.toContain("branding");
    expect(matchPages("branding", true).map((p) => p.id)).toContain("branding");
  });
  it("gives every page somewhere to go", () => {
    for (const p of APP_PAGES) expect(p.href || p.action, p.id).toBeTruthy();
  });
  it("uses unique ids", () => {
    expect(new Set(APP_PAGES.map((p) => p.id)).size).toBe(APP_PAGES.length);
  });
});
