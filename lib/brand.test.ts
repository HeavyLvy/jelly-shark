import { describe, expect, it } from "vitest";
import { BRAND_NAME_MAX, ICON_PRESETS, accentContrast, contrastRatio, onAccent, parseBrand, presetFaviconSvg, sniffIcon, svgProblem } from "./brand";

const ok = { name: "Cinema Den", accent: "#2fc7d9", icon: { kind: "preset", preset: "shark" } };

describe("parseBrand", () => {
  it("accepts a valid brand and tidies it", () => {
    const r = parseBrand({ ...ok, name: "  Cinema   Den ", accent: "#2FC7D9" });
    expect(r).toEqual({ ok: true, value: { name: "Cinema Den", accent: "#2fc7d9", icon: { kind: "preset", preset: "shark" } } });
  });
  it("accepts an uploaded icon", () => {
    expect(parseBrand({ ...ok, icon: { kind: "upload" } })).toMatchObject({ ok: true, value: { icon: { kind: "upload" } } });
  });
  it.each([
    ["no input", null],
    ["an empty name", { ...ok, name: "   " }],
    ["a too-long name", { ...ok, name: "x".repeat(BRAND_NAME_MAX + 1) }],
    ["markup in the name", { ...ok, name: "<b>Den</b>" }],
    ["a control character in the name", { ...ok, name: "Den\u0007" }],
    ["a color that isn't #rrggbb", { ...ok, accent: "teal" }],
    ["a color too dark to read", { ...ok, accent: "#101010" }],
    ["no icon", { ...ok, icon: null }],
    ["an unknown preset", { ...ok, icon: { kind: "preset", preset: "nope" } }],
  ])("rejects %s", (_label, input) => {
    expect(parseBrand(input).ok).toBe(false);
  });
  it("allows a name of exactly the maximum length", () => {
    expect(parseBrand({ ...ok, name: "x".repeat(BRAND_NAME_MAX) }).ok).toBe(true);
  });
});

describe("colors", () => {
  it("computes contrast the WCAG way", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });
  it("picks readable text for an accent", () => {
    expect(onAccent("#2fc7d9")).toBe("#04161b");
    expect(onAccent("#1e3a8a")).toBe("#ffffff");
  });
  it("accepts the default accent on the app background", () => {
    expect(accentContrast("#2fc7d9")).toBeGreaterThan(3);
  });
});

describe("icons", () => {
  it("builds a favicon for every preset in the accent color", () => {
    for (const p of ICON_PRESETS) {
      const svg = presetFaviconSvg(p.id, "#ff00aa");
      expect(svg).toContain("#ff00aa");
      expect(svg).not.toContain("currentColor");
    }
  });
  it("recognises image types from their bytes, not their names", () => {
    expect(sniffIcon(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toBe("image/png");
    expect(sniffIcon(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe("image/jpeg");
    expect(sniffIcon(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe("image/svg+xml");
    expect(sniffIcon(new TextEncoder().encode("MZ not an image"))).toBeNull();
  });
  it("refuses SVGs that can run code or load other files", () => {
    expect(svgProblem('<svg><script>alert(1)</script></svg>')).toBeTruthy();
    expect(svgProblem('<svg onload="x()"></svg>')).toBeTruthy();
    expect(svgProblem('<svg><image href="https://evil.example/a.png"/></svg>')).toBeTruthy();
    expect(svgProblem('<svg><foreignObject/></svg>')).toBeTruthy();
    expect(svgProblem('<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>')).toBeNull();
  });
});
