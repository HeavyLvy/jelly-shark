import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
