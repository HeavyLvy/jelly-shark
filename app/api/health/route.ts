import { connection, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";

/** Liveness/readiness for the container healthcheck: the app is up and its database opens. No auth, no data. */
export async function GET() {
  // Synchronous SQLite would otherwise run (once) while prerendering at build time.
  await connection();
  try {
    db().select().from(settings).limit(1).all();
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
