#!/usr/bin/env node
// Mock Seerr server for tests and screenshots: `node scripts/mock-seerr.mjs`.
//
// Answers the few Seerr API routes Jelly Shark uses, with fictional data and
// nothing fetched from the network. Seerr's real API lives at /api/v1.
//
// Keys: `mock-seerr-api-key` belongs to the administrator; `mock-seerr-user-key`
// is a key without admin rights (to test that Jelly Shark refuses it).
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_SEERR_PORT ?? 5056);
const ADMIN_KEY = "mock-seerr-api-key";
const USER_KEY = "mock-seerr-user-key";

const ADMIN = 2; // Seerr's Admin permission bit
const REQUEST = 32;

const json = (res, body, status = 200) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

const server = createServer((req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = u.pathname.replace(/\/+$/, "") || "/";
  const key = req.headers["x-api-key"];

  if (path === "/api/v1/status") return json(res, { version: "3.5.1", commitTag: "mock", updateAvailable: false, commitsBehind: 0, restartRequired: false });

  if (path === "/api/v1/auth/me") {
    if (key === ADMIN_KEY) return json(res, { id: 1, displayName: "demo", permissions: ADMIN, jellyfinUserId: "a1b2c3d4e5f647488a9b0c1d2e3f4a5b" });
    if (key === USER_KEY) return json(res, { id: 2, displayName: "guest", permissions: REQUEST });
    return json(res, { message: "Forbidden" }, 403);
  }

  json(res, { message: "Not found" }, 404);
});

server.listen(PORT, "127.0.0.1", () => console.log(`Mock Seerr on http://127.0.0.1:${PORT}`));
