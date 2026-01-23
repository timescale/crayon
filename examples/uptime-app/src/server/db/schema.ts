import { relations } from "drizzle-orm";
import { integer, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { env } from "~/env";

export const schema = pgSchema(env.DATABASE_SCHEMA);

export const urls = schema.table("urls", {
  id: uuid("id").primaryKey().defaultRandom(),
  url: text("url").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const checks = schema.table("checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  urlId: uuid("url_id")
    .notNull()
    .references(() => urls.id, { onDelete: "cascade" }),
  statusCode: integer("status_code"),
  responseTimeMs: integer("response_time_ms"),
  error: text("error"),
  checkedAt: timestamp("checked_at").defaultNow().notNull(),
});

export const urlsRelations = relations(urls, ({ many }) => ({
  checks: many(checks),
}));

export const checksRelations = relations(checks, ({ one }) => ({
  url: one(urls, { fields: [checks.urlId], references: [urls.id] }),
}));
