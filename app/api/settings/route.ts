import { NextResponse } from "next/server";
import { isSameOrigin, jsonError, readJsonBody } from "@/lib/http";
import { activeAccount, readSession } from "@/lib/session";
import { getSettings, setSettings } from "@/lib/settings-store";

async function currentUserId(): Promise<string | null> {
  const session = await readSession();
  return (session && activeAccount(session)?.userId) || null;
}

/** The signed-in user's saved settings: { video, ui, popularPeriod } (keys they've set). */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return jsonError(401, "unauthenticated");
  return NextResponse.json({ userId, settings: getSettings(userId) }, { headers: { "Cache-Control": "no-store" } });
}

/** Save settings: body `{ video?: …, ui?: …, popularPeriod?: … }` replaces just those keys. */
export async function PUT(req: Request) {
  if (!isSameOrigin(req)) return jsonError(403, "cross_origin");
  const userId = await currentUserId();
  if (!userId) return jsonError(401, "unauthenticated");
  const body = await readJsonBody<Record<string, unknown>>(req);
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError(400, "invalid_body");
  const problem = setSettings(userId, body);
  if (problem) return jsonError(400, "invalid_settings", { detail: problem });
  return new NextResponse(null, { status: 204 });
}
