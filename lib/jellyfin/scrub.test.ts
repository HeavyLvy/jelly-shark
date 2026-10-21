import { describe, expect, it } from "vitest";
import { isJsonContentType, isPlaylistContentType, scrubJson, scrubPlaylist, stripApiKeyParams, type ScrubContext } from "./scrub";

const ctx: ScrubContext = { token: "SECRETTOKEN123", upstreamOrigin: "http://jf.example:8096", upstreamBasePath: "" };

describe("stripApiKeyParams", () => {
  it("removes the key and keeps the rest of the query", () => {
    expect(stripApiKeyParams("/a?ApiKey=abc&x=1")).toBe("/a?x=1");
    expect(stripApiKeyParams("/a?x=1&api_key=abc&y=2")).toBe("/a?x=1&y=2");
    expect(stripApiKeyParams("/a?ApiKey=abc")).toBe("/a");
  });
});

describe("scrubJson", () => {
  it("never lets a token reach the browser", () => {
    const out = scrubJson(
      {
        Name: "Movie",
        AccessToken: "SECRETTOKEN123",
        TranscodingUrl: "/videos/1/master.m3u8?ApiKey=SECRETTOKEN123&MediaSourceId=9",
        MediaStreams: [{ DeliveryUrl: "http://jf.example:8096/Videos/1/Subtitles/2/0/Stream.vtt?api_key=SECRETTOKEN123" }],
      },
      ctx,
    );
    const text = JSON.stringify(out);
    expect(text).not.toContain("SECRETTOKEN123");
    expect(text).not.toMatch(/api_?key/i);
    expect(out).toMatchObject({ Name: "Movie", TranscodingUrl: "/api/jf/videos/1/master.m3u8?MediaSourceId=9" });
  });
  it("sends Jellyfin URLs back through the proxy and leaves other text alone", () => {
    const out = scrubJson({ Path: "/media/movies/a.mkv", ImageUrl: "http://jf.example:8096/Items/1/Images/Primary" }, ctx) as Record<string, string>;
    expect(out.Path).toBe("/media/movies/a.mkv");
    expect(out.ImageUrl).toBe("/api/jf/Items/1/Images/Primary");
  });
  it("does not rewrite links to other hosts", () => {
    const out = scrubJson({ Url: "https://other.example/x" }, ctx) as Record<string, string>;
    expect(out.Url).toBe("https://other.example/x");
  });
});

describe("scrubPlaylist", () => {
  it("cleans every URI in an HLS playlist", () => {
    const text = [
      "#EXTM3U",
      '#EXT-X-MEDIA:TYPE=SUBTITLES,URI="/videos/1/sub.m3u8?ApiKey=SECRETTOKEN123"',
      "http://jf.example:8096/videos/1/main.m3u8?ApiKey=SECRETTOKEN123&x=1",
      "hls1/main/0.mp4",
    ].join("\n");
    const out = scrubPlaylist(text, ctx);
    expect(out).not.toContain("SECRETTOKEN123");
    expect(out).toContain('URI="/api/jf/videos/1/sub.m3u8"');
    expect(out).toContain("/api/jf/videos/1/main.m3u8?x=1");
    expect(out).toContain("hls1/main/0.mp4");
  });
});

describe("content types", () => {
  it("recognises JSON and HLS playlists", () => {
    expect(isJsonContentType("application/json; charset=utf-8")).toBe(true);
    expect(isJsonContentType("application/problem+json")).toBe(true);
    expect(isJsonContentType("video/mp4")).toBe(false);
    expect(isPlaylistContentType("application/vnd.apple.mpegurl")).toBe(true);
    expect(isPlaylistContentType(null)).toBe(false);
  });
});
