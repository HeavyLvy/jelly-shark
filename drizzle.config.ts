import { defineConfig } from "drizzle-kit";

/** `npm run db:generate` reads lib/db/schema.ts and writes migrations to ./drizzle. */
export default defineConfig({
  dialect: "sqlite",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
});
