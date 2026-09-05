import { pgEnum, pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import type { InferSelectModel } from "drizzle-orm";

export const sessionStatusEnum = pgEnum("session_status", ["IDLE", "WAITING", "CONNECTED"]);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    socketId: text("socket_id").notNull().unique(),
    status: sessionStatusEnum("status").notNull().default("IDLE"),
    roomId: uuid("room_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_status_updated_idx").on(t.status, t.updatedAt)],
);

export const rooms = pgTable("rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  user1Id: uuid("user1_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  user2Id: uuid("user2_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Session = InferSelectModel<typeof sessions>;
export type Room = InferSelectModel<typeof rooms>;
export type SessionStatus = Session["status"];
