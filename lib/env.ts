import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Set it in .env.local, or as an environment variable (see .env.example).`);
  }
  return value;
}

/** Jellyfin base URL without a trailing slash, e.g. `http://192.168.1.125:8096`. */
export function jellyfinUrl(): string {
  const raw = required("JELLYFIN_URL").trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`JELLYFIN_URL is not a valid URL: ${raw}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("JELLYFIN_URL must start with http:// or https://");
  }
  return raw;
}

export function sessionSecret(): string {
  const secret = required("SESSION_SECRET");
  if (secret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters long.");
  }
  return secret;
}
