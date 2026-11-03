import { describe, expect, it } from "vitest";
import { formatDay, formatMinutes, formatMoney, languageName, plural, yearsOf } from "./format";

describe("formatMinutes", () => {
  it.each([[136, "2h 16m"], [120, "2h"], [45, "45m"], [61, "1h 1m"], [0, null], [null, null], [-5, null]])("%s → %s", (n, expected) => expect(formatMinutes(n)).toBe(expected));
});

describe("formatDay", () => {
  it("writes the day it was given, whatever the time zone", () => {
    expect(formatDay("2019-05-03", "en-US")).toBe("May 3, 2019");
    expect(formatDay("2019-01-01T00:00:00.000Z", "en-US")).toBe("January 1, 2019");
  });
  it("says nothing for a missing or odd date", () => {
    expect(formatDay(null)).toBeNull();
    expect(formatDay("soon")).toBeNull();
  });
});

describe("formatMoney", () => {
  it.each([[63_000_000, "$63M"], [463_517_383, "$464M"], [12_340_000, "$12.3M"], [1_234_000_000, "$1.2B"], [950_000, "$950K"], [500, "$500"], [0, null], [null, null]])("%s → %s", (n, expected) => expect(formatMoney(n)).toBe(expected));
});

describe("languageName", () => {
  it("names a language, and falls back to the code", () => {
    expect(languageName("en")).toBe("English");
    expect(languageName("ja")).toBe("Japanese");
    expect(languageName(null)).toBeNull();
  });
});

describe("yearsOf", () => {
  const show = (over: object) => ({ item: { mediaType: "tv", year: "2008" }, date: "2008-01-20", lastDate: "2013-09-29", statusText: "Ended", ...over }) as Parameters<typeof yearsOf>[0];
  it("gives a movie its year", () => expect(yearsOf({ item: { mediaType: "movie", year: "2019" }, date: "2019-05-03", lastDate: null, statusText: "Released" } as Parameters<typeof yearsOf>[0])).toBe("2019"));
  it("gives an ended show its span", () => expect(yearsOf(show({}))).toBe("2008–2013"));
  it("says Present for a show that's still going", () => expect(yearsOf(show({ statusText: "Returning Series" }))).toBe("2008–Present"));
  it("gives a one-year show a single year", () => expect(yearsOf(show({ lastDate: "2008-12-01" }))).toBe("2008"));
});

describe("plural", () => {
  it("adds an s except for one", () => {
    expect(plural(1, "Season")).toBe("1 Season");
    expect(plural(3, "Season")).toBe("3 Seasons");
  });
});
