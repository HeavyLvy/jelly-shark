/**
 * Runs once when the server starts: fail fast, with a readable message, if the
 * required configuration is missing (instead of on the first request).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { checkConfigOrExit } = await import("@/lib/startup-check");
  checkConfigOrExit();
}
