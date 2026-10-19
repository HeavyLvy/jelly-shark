// Runs the production build without Docker: `npm run build`, then `npm start`.
//
// The build is a self-contained server in .next/standalone, but it needs the
// static assets, public files and database migrations copied next to it (the
// Dockerfile does the same), and it runs from inside that folder. So this
// copies them in, loads .env.local / .env, and keeps the settings database
// in ./data instead of inside the build (which the next build would wipe).
import { spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const out = resolve(root, ".next/standalone");
const server = resolve(out, "server.js");

if (!existsSync(server)) {
  console.error("No production build found. Run `npm run build` first.");
  process.exit(1);
}

// Values already in the environment win, then .env.local, then .env.
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

cpSync(resolve(root, ".next/static"), resolve(out, ".next/static"), { recursive: true });
cpSync(resolve(root, "public"), resolve(out, "public"), { recursive: true });
cpSync(resolve(root, "drizzle"), resolve(out, "drizzle"), { recursive: true });

const env = { ...process.env, DATABASE_PATH: resolve(root, process.env.DATABASE_PATH ?? "data/jelly-shark.db") };
const child = spawn(process.execPath, [server], { stdio: "inherit", env });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
