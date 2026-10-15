import { NextResponse } from "next/server";
import { isSameOrigin, jsonError, readJsonBody } from "@/lib/http";
import { readSession, toPublicAccount, writeSession } from "@/lib/session";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return jsonError(403, "cross_origin");

  const body = await readJsonBody<{ userId?: unknown }>(req);
  const userId = typeof body?.userId === "string" ? body.userId : "";
  const session = await readSession();
  const account = session?.accounts.find((a) => a.userId === userId);
  if (!session || !account) return jsonError(404, "unknown_account");

  await writeSession({ ...session, activeUserId: account.userId });
  return NextResponse.json({ account: toPublicAccount(account) });
}
