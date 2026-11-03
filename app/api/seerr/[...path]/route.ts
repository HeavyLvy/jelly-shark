import { NextResponse, type NextRequest } from "next/server";
import { isSameOrigin, jsonError, readJsonBody } from "@/lib/http";
import { rateLimited } from "@/lib/rate-limit";
import { SEERR_PROXY_PREFIX } from "@/lib/constants";
import { seerrCall, seerrMessage } from "@/lib/seerr/client";
import { requireSeerrUser, requireSignedIn } from "@/lib/seerr/context";
import { normalizeCredits, normalizeDetail, normalizeEpisodes, normalizeGenres, normalizeItem, normalizeList, normalizeMixed, normalizePerson, normalizeRequests, pageOf } from "@/lib/seerr/normalize";
import type { SeerrDiscoverKind, SeerrItem, SeerrMediaType, SeerrRequestBody } from "@/lib/seerr/types";

/**
 * Jelly Shark's own Seerr API for the browser. It is NOT a pass-through: each
 * route here does one fixed thing, asks Seerr as the signed-in person (the
 * admin key never leaves the server) and sends back a trimmed reply.
 *
 *   GET  /api/seerr/status               is Seerr set up?
 *   GET  /api/seerr/search?query=        titles to request
 *   GET  /api/seerr/movie/<id>, /tv/<id> one title: cast, facts, a show's seasons
 *   GET  /api/seerr/<movie|tv>/<id>/recommendations | similar
 *   GET  /api/seerr/tv/<id>/season/<n>   a season's episodes
 *   GET  /api/seerr/person/<id>[/credits] a person and the titles they're in
 *   GET  /api/seerr/discover/<row>       trending | movies | tv | upcoming-movies | upcoming-tv  (?page=n)
 *   GET  /api/seerr/genres/<movie|tv>    the genres to browse
 *   GET  /api/seerr/discover/genre/<movie|tv>/<id>  titles in one genre (?page=n)
 *   GET  /api/seerr/requests             your own requests, newest first
 *   POST /api/seerr/request              ask for a movie, or seasons of a show
 *   DELETE /api/seerr/request/<id>       cancel one of your own requests that is still waiting
 *   GET  /api/seerr/image/<size>/<file>  a poster, fetched through Seerr
 */

const noStore = { "Cache-Control": "no-store" };
const IMAGE_SIZES = new Set(["w185", "w300", "w342", "w500", "w780", "w1280"]);
const MAX_TERM = 120;

function parseId(raw: string): number | null {
  return /^\d{1,9}$/.test(raw) && Number(raw) > 0 ? Number(raw) : null;
}

async function search(req: NextRequest): Promise<Response> {
  const term = (req.nextUrl.searchParams.get("query") ?? "").trim().slice(0, MAX_TERM);
  if (term.length < 2) return NextResponse.json({ results: [] }, { headers: noStore });
  const ctx = await requireSeerrUser();
  if (ctx instanceof Response) return ctx;
  try {
    const { status, data } = await seerrCall(ctx.config, `/search?query=${encodeURIComponent(term)}&page=1`, { asUser: ctx.seerrUserId });
    if (status !== 200) return jsonError(502, "seerr_error", { message: seerrMessage(data) ?? undefined });
    const raw = typeof data === "object" && data !== null ? (data as { results?: unknown }).results : null;
    const results = (Array.isArray(raw) ? raw : []).map(normalizeItem).filter((i): i is SeerrItem => i !== null);
    return NextResponse.json({ results }, { headers: noStore });
  } catch {
    return jsonError(502, "upstream_unreachable");
  }
}

async function detail(type: SeerrMediaType, rawId: string): Promise<Response> {
  const id = parseId(rawId);
  return id === null ? jsonError(400, "bad_id") : lookup(`/${type}/${id}`, (d) => normalizeDetail(d, type));
}

async function related(type: SeerrMediaType, rawId: string, kind: string): Promise<Response> {
  const id = parseId(rawId);
  if (id === null || (kind !== "recommendations" && kind !== "similar")) return jsonError(400, "bad_id");
  return lookup(`/${type}/${id}/${kind}?page=1`, (d) => ({ results: normalizeList(d, type).slice(0, 24) }));
}

async function season(rawId: string, rawNumber: string): Promise<Response> {
  const id = parseId(rawId);
  const n = /^\d{1,3}$/.test(rawNumber) ? Number(rawNumber) : null;
  if (id === null || n === null || n < 1) return jsonError(400, "bad_id");
  return lookup(`/tv/${id}/season/${n}`, (d) => ({ episodes: normalizeEpisodes(d) }));
}

async function person(rawId: string, credits: boolean): Promise<Response> {
  const id = parseId(rawId);
  if (id === null) return jsonError(400, "bad_id");
  return credits ? lookup(`/person/${id}/combined_credits`, (d) => normalizeCredits(d)) : lookup(`/person/${id}`, (d) => normalizePerson(d));
}

/** Asks Seerr as the signed-in person and sends `shape(data)` back; `null` from `shape` means Seerr sent something unusable. */
async function lookup<T>(path: string, shape: (data: unknown) => T | null): Promise<Response> {
  const ctx = await requireSeerrUser();
  if (ctx instanceof Response) return ctx;
  try {
    const { status, data } = await seerrCall(ctx.config, path, { asUser: ctx.seerrUserId });
    if (status === 404) return jsonError(404, "not_found");
    if (status !== 200) return jsonError(502, "seerr_error", { message: seerrMessage(data) ?? undefined });
    const out = shape(data);
    return out === null ? jsonError(502, "seerr_error") : NextResponse.json(out, { headers: noStore });
  } catch {
    return jsonError(502, "upstream_unreachable");
  }
}

/** Seerr's own paths for each Discover row, and the kind of title a row holds (`null`: a mix, which says so itself). */
const DISCOVER: Record<SeerrDiscoverKind, { path: string; type: SeerrMediaType | null }> = {
  trending: { path: "/discover/trending", type: null },
  movies: { path: "/discover/movies", type: "movie" },
  tv: { path: "/discover/tv", type: "tv" },
  "upcoming-movies": { path: "/discover/movies/upcoming", type: "movie" },
  "upcoming-tv": { path: "/discover/tv/upcoming", type: "tv" },
};

/** `?page=` as a whole number from 1 to 500 (where TMDB stops), or null. */
function parsePage(req: NextRequest): number | null {
  const raw = req.nextUrl.searchParams.get("page");
  if (raw === null) return 1;
  return /^\d{1,3}$/.test(raw) && Number(raw) >= 1 && Number(raw) <= 500 ? Number(raw) : null;
}

async function pagedList(req: NextRequest, path: string, type: SeerrMediaType | null): Promise<Response> {
  const page = parsePage(req);
  if (page === null) return jsonError(400, "bad_page");
  return lookup(`${path}?page=${page}`, (d) => ({ results: type ? normalizeList(d, type) : normalizeMixed(d), ...pageOf(d) }));
}

async function discover(req: NextRequest, kind: string): Promise<Response> {
  const row = Object.hasOwn(DISCOVER, kind) ? DISCOVER[kind as SeerrDiscoverKind] : null;
  return row ? pagedList(req, row.path, row.type) : jsonError(404, "not_found");
}

async function genreTitles(req: NextRequest, type: string, rawId: string): Promise<Response> {
  const id = parseId(rawId);
  if (type !== "movie" && type !== "tv") return jsonError(404, "not_found");
  if (id === null) return jsonError(400, "bad_id");
  return pagedList(req, `/discover/${type === "movie" ? "movies" : "tv"}/genre/${id}`, type);
}

async function genres(type: string): Promise<Response> {
  if (type !== "movie" && type !== "tv") return jsonError(404, "not_found");
  return lookup(`/genres/${type}`, (d) => ({ genres: normalizeGenres(d) }));
}

/** The signed-in person's own requests. Seerr gives an administrator everyone's unless told whose to list. */
async function myRequests(): Promise<Response> {
  const ctx = await requireSeerrUser();
  if (ctx instanceof Response) return ctx;
  return lookup(`/request?take=60&skip=0&sort=added&filter=all&requestedBy=${ctx.seerrUserId}`, (d) => ({ requests: normalizeRequests(d) }));
}

/** Checks the body of a request: only what the app sends, nothing a person could use to pick quality profiles, 4K or someone else's account. */
function parseRequestBody(body: unknown): SeerrRequestBody | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as { mediaType?: unknown; mediaId?: unknown; seasons?: unknown };
  if (b.mediaType !== "movie" && b.mediaType !== "tv") return null;
  if (typeof b.mediaId !== "number" || !Number.isInteger(b.mediaId) || b.mediaId <= 0 || b.mediaId > 999_999_999) return null;
  if (b.mediaType === "movie") return { mediaType: "movie", mediaId: b.mediaId };
  if (!Array.isArray(b.seasons) || b.seasons.length === 0 || b.seasons.length > 100) return null;
  const seasons = [...new Set(b.seasons)];
  if (!seasons.every((s): s is number => typeof s === "number" && Number.isInteger(s) && s >= 1 && s <= 500)) return null;
  return { mediaType: "tv", mediaId: b.mediaId, seasons: seasons.sort((x, y) => x - y) };
}

async function makeRequest(req: NextRequest): Promise<Response> {
  if (!isSameOrigin(req)) return jsonError(403, "cross_origin");
  const body = parseRequestBody(await readJsonBody<unknown>(req));
  if (!body) return jsonError(400, "invalid_body");
  const ctx = await requireSeerrUser();
  if (ctx instanceof Response) return ctx;
  if (rateLimited(`seerr-request:${ctx.jellyfinUserId}`, 20, 60_000)) return jsonError(429, "slow_down", { message: "Too many requests at once. Wait a minute and try again." });
  try {
    const { status, data } = await seerrCall(ctx.config, "/request", { method: "POST", body, asUser: ctx.seerrUserId });
    if (status === 201 || status === 200) {
      const s = typeof data === "object" && data !== null ? (data as { status?: unknown }).status : null;
      return NextResponse.json({ status: s === 1 ? "pending" : "processing" }, { status: 201, headers: noStore });
    }
    const message = seerrMessage(data);
    if (status === 403) return jsonError(403, "no_permission", { message: message ?? "You don't have permission to make requests." });
    // Seerr answers 202 when every season asked for is already requested or in the library.
    if (status === 202) return jsonError(409, "already_requested", { message: message ?? "That has already been requested." });
    if (status === 409) return jsonError(409, "already_requested", { message: message ?? "That has already been requested." });
    if (status >= 400 && status < 500) return jsonError(status === 404 ? 404 : 400, "rejected", { message: message ?? "Seerr couldn't take that request." });
    return jsonError(502, "seerr_error");
  } catch {
    return jsonError(502, "upstream_unreachable");
  }
}

/**
 * Cancels a request, but only one that is the signed-in person's own and still
 * waiting for approval. Seerr's key acts as them, and an administrator account
 * could delete anything, so this checks first instead of trusting that.
 */
async function cancelRequest(req: NextRequest, rawId: string): Promise<Response> {
  if (!isSameOrigin(req)) return jsonError(403, "cross_origin");
  const id = parseId(rawId);
  if (id === null) return jsonError(400, "bad_id");
  const ctx = await requireSeerrUser();
  if (ctx instanceof Response) return ctx;
  if (rateLimited(`seerr-cancel:${ctx.jellyfinUserId}`, 30, 60_000)) return jsonError(429, "slow_down", { message: "Too many changes at once. Wait a minute and try again." });
  try {
    const found = await seerrCall(ctx.config, `/request/${id}`, { asUser: ctx.seerrUserId });
    if (found.status === 404) return jsonError(404, "not_found");
    if (found.status !== 200 || typeof found.data !== "object" || found.data === null) return jsonError(502, "seerr_error");
    const r = found.data as { status?: unknown; requestedBy?: { id?: unknown } | null };
    if (r.requestedBy?.id !== ctx.seerrUserId) return jsonError(403, "not_yours", { message: "That isn't your request." });
    if (r.status !== 1) return jsonError(409, "not_waiting", { message: "That request has already been handled, so it can't be cancelled." });
    const gone = await seerrCall(ctx.config, `/request/${id}`, { method: "DELETE", asUser: ctx.seerrUserId });
    if (gone.status === 204 || gone.status === 200 || gone.status === 404) return NextResponse.json({ ok: true }, { headers: noStore });
    if (gone.status === 403) return jsonError(403, "no_permission", { message: seerrMessage(gone.data) ?? "You can't cancel that request." });
    return jsonError(502, "seerr_error", { message: seerrMessage(gone.data) ?? undefined });
  } catch {
    return jsonError(502, "upstream_unreachable");
  }
}

async function image(size: string, file: string): Promise<Response> {
  if (!IMAGE_SIZES.has(size) || !/^[A-Za-z0-9_-]{1,80}\.(?:jpg|png)$/.test(file)) return jsonError(400, "bad_path");
  const base = await requireSignedIn();
  if (base instanceof Response) return base;
  try {
    const res = await fetch(`${base.config.url}/imageproxy/tmdb/t/p/${size}/${file}`, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(15_000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/^image\/(?:jpe?g|png)/i.test(type)) {
      await res.body?.cancel();
      return new Response(null, { status: 404 });
    }
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > 5 * 1024 * 1024) return new Response(null, { status: 404 });
    return new Response(bytes, { headers: { "content-type": type.startsWith("image/png") ? "image/png" : "image/jpeg", "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff", "content-security-policy": "sandbox; default-src 'none'" } });
  } catch {
    return new Response(null, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  const parts = req.nextUrl.pathname.slice(SEERR_PROXY_PREFIX.length).split("/").filter(Boolean);
  const [first, second, third, fourth] = parts;
  const isTitle = first === "movie" || first === "tv";
  if (parts.length === 1 && first === "status") {
    const base = await requireSignedIn();
    return base instanceof Response ? (base.status === 404 ? NextResponse.json({ enabled: false }, { headers: noStore }) : base) : NextResponse.json({ enabled: true }, { headers: noStore });
  }
  if (parts.length === 1 && first === "search") return search(req);
  if (parts.length === 1 && first === "requests") return myRequests();
  if (parts.length === 2 && first === "discover") return discover(req, second);
  if (parts.length === 4 && first === "discover" && second === "genre") return genreTitles(req, third!, fourth!);
  if (parts.length === 2 && first === "genres") return genres(second!);
  if (parts.length === 2 && isTitle) return detail(first, second);
  if (parts.length === 3 && isTitle) return related(first, second, third);
  if (parts.length === 4 && first === "tv" && third === "season") return season(second, fourth);
  if (parts.length === 2 && first === "person") return person(second, false);
  if (parts.length === 3 && first === "person" && third === "credits") return person(second, true);
  if (parts.length === 3 && first === "image") return image(second, third);
  return jsonError(404, "not_found");
}

export async function DELETE(req: NextRequest) {
  const parts = req.nextUrl.pathname.slice(SEERR_PROXY_PREFIX.length).split("/").filter(Boolean);
  if (parts.length === 2 && parts[0] === "request") return cancelRequest(req, parts[1]!);
  return jsonError(404, "not_found");
}

export async function POST(req: NextRequest) {
  const parts = req.nextUrl.pathname.slice(SEERR_PROXY_PREFIX.length).split("/").filter(Boolean);
  if (parts.length === 1 && parts[0] === "request") return makeRequest(req);
  return jsonError(404, "not_found");
}
