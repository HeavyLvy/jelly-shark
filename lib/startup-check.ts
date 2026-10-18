import "server-only";
import { jellyfinUrl, sessionSecret } from "@/lib/env";

/** Exit with a readable message if required configuration is missing (called once at server start). */
export function checkConfigOrExit() {
  try {
    jellyfinUrl();
    sessionSecret();
  } catch (err) {
    console.error(`\nJelly Shark can't start: ${(err as Error).message}\n`);
    process.exit(1);
  }
}
