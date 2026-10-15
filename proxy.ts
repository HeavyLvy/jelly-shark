import { NextResponse, type NextRequest } from "next/server";
import {
  DEVICE_COOKIE,
  DEVICE_COOKIE_MAX_AGE,
  SESSION_COOKIE,
  isValidDeviceId,
} from "@/lib/constants";

/**
 * Optimistic auth gate + stable DeviceId.
 *
 * - Ensures every browser has a `jf_device` cookie (set on the forwarded
 *   request too, so the same request can use it).
 * - Redirects page routes to /login when there is no session cookie.
 *   The cookie is only checked for presence here; route handlers verify it.
 * - Never redirects /api/* — those answer 401 JSON so media elements and
 *   hls.js don't receive an HTML login page.
 */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  let deviceId = req.cookies.get(DEVICE_COOKIE)?.value;
  const needsDevice = !isValidDeviceId(deviceId);
  if (needsDevice) {
    deviceId = crypto.randomUUID();
    req.cookies.set(DEVICE_COOKIE, deviceId);
  }

  const isApi = pathname.startsWith("/api/");
  const isLogin = pathname === "/login";
  const hasSession = req.cookies.has(SESSION_COOKIE);

  let res: NextResponse;
  if (!isApi && !isLogin && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    res = NextResponse.redirect(url);
  } else {
    res = NextResponse.next({ request: { headers: req.headers } });
  }

  if (needsDevice && deviceId) {
    res.cookies.set(DEVICE_COOKIE, deviceId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: false,
      maxAge: DEVICE_COOKIE_MAX_AGE,
    });
  }
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|woff2?)$).*)",
  ],
};
