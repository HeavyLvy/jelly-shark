import { describe, expect, it } from "vitest";
import { allowedEdits, normalize, rankEntries, scoreName, toEntry } from "./search-fuzzy";

const titles = ["SpongeBob SquarePants", "Spider-Man: Homecoming", "WALL·E", "Amélie", "Bluey", "Severance", "Dune: Part Two", "Dune", "Sponge Out of Water", "Spirited Away"];
const entries = titles.map((t, i) => toEntry(String(i), t));
const find = (q: string, limit = 5) => rankEntries(entries, q, limit).map((e) => titles[Number(e.id)]);

describe("normalize", () => {
  it("drops case, spaces, symbols and accents", () => {
    expect(normalize("SpongeBob SquarePants!")).toBe("spongebobsquarepants");
    expect(normalize("Amélie")).toBe("amelie");
    expect(normalize("WALL·E")).toBe("walle");
    expect(normalize("  !!  ")).toBe("");
  });
});

describe("rankEntries", () => {
  it("finds a title through typos and missing letters", () => {
    expect(find("Spnge Bobo")[0]).toBe("SpongeBob SquarePants");
    expect(find("bluy")).toEqual(["Bluey"]);
  });
  it("finds a title with swapped letters", () => {
    expect(find("dnue")[0]).toBe("Dune");
  });
  it("ignores spacing and punctuation on both sides", () => {
    expect(find("spiderman")).toEqual(["Spider-Man: Homecoming"]);
    expect(find("sponge bob")[0]).toBe("SpongeBob SquarePants");
    expect(find("walle")).toEqual(["WALL·E"]);
    expect(find("amelie")).toEqual(["Amélie"]);
  });
  it("ranks exact, then prefix, then looser matches", () => {
    expect(find("dune")).toEqual(["Dune", "Dune: Part Two"]);
  });
  it("matches a word in the middle of a title", () => {
    expect(find("squarepants")).toEqual(["SpongeBob SquarePants"]);
  });
  it("returns nothing for gibberish or symbol-only input", () => {
    expect(find("zzzz")).toEqual([]);
    expect(find("!!")).toEqual([]);
    expect(find("")).toEqual([]);
  });
  it("allows no typos in very short queries", () => {
    expect(allowedEdits(3)).toBe(0);
    expect(allowedEdits(4)).toBe(1);
    expect(allowedEdits(9)).toBe(2);
    expect(find("sxn")).toEqual([]);
  });
  it("respects the limit", () => {
    expect(find("sp", 2)).toHaveLength(2);
  });
  it("matches an artist together with the song title, in either order", () => {
    const songs = [toEntry("a", "One More Time", "Daft Punk", "Discovery"), toEntry("b", "Digital Love", "Daft Punk", "Discovery")];
    expect(rankEntries(songs, "daft punk one more time", 3).map((e) => e.id)).toEqual(["a"]);
    expect(rankEntries(songs, "one more time daft punk", 3).map((e) => e.id)).toEqual(["a"]);
    expect(rankEntries(songs, "daft punk", 3).map((e) => e.id).sort()).toEqual(["a", "b"]);
  });
  it("stays fast on a large library", () => {
    const big = Array.from({ length: 40_000 }, (_, i) => toEntry(String(i), `Some Track Number ${i} Of The Album`, `Artist ${i % 500}`));
    const start = performance.now();
    rankEntries(big, "sme trak numbr", 20);
    expect(performance.now() - start).toBeLessThan(1500);
  });
});

describe("scoreName", () => {
  it("is 0 for no match and higher for closer ones", () => {
    expect(scoreName("Inception", "xyz")).toBe(0);
    expect(scoreName("Inception", "inception")).toBeGreaterThan(scoreName("Inception", "incep"));
    expect(scoreName("Inception", "inceptoin")).toBeGreaterThan(0);
    expect(scoreName(null, "x")).toBe(0);
  });
});
