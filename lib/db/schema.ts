import { blob, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Database schema (Drizzle). Change tables here, then run `npm run db:generate`
 * to create a migration; migrations are applied automatically at startup.
 */

/** Per-user settings: one JSON value per (user, key). */
export const settings = sqliteTable(
  "settings",
  {
    userId: text("user_id").notNull(),
    key: text("key").notNull(),
    /** JSON-encoded value. */
    value: text("value").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

/** Instance-wide settings (not per user): e.g. the branding. One JSON value per key. */
export const instanceSettings = sqliteTable("instance_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** Uploaded files kept in the database (e.g. the custom brand icon). */
export const assets = sqliteTable("assets", {
  key: text("key").primaryKey(),
  mime: text("mime").notNull(),
  data: blob("data", { mode: "buffer" }).notNull(),
  updatedAt: integer("updated_at").notNull(),
});
