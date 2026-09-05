import { and, asc, count, eq, ne, or, sql } from "drizzle-orm";
import { db } from "../db";
import { rooms, sessions, type Room, type Session } from "../db/schema";

export interface MatchResult {
  room: Room;
  self: Session;
  peer: Session;
}

export interface LeaveResult {
  roomId: string;
  peer: Session | null;
}

export async function resetAllSessions(): Promise<void> {
  await db.delete(rooms);
  await db.delete(sessions);
}

export async function createSession(socketId: string): Promise<Session> {
  const [session] = await db
    .insert(sessions)
    .values({ socketId, status: "IDLE" })
    .onConflictDoUpdate({
      target: sessions.socketId,
      set: { status: "IDLE", roomId: null, updatedAt: sql`now()` },
    })
    .returning();
  return session;
}

export async function getSession(sessionId: string): Promise<Session | null> {
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  return session ?? null;
}

export async function enqueueSession(sessionId: string): Promise<Session | null> {
  const [session] = await db
    .update(sessions)
    .set({ status: "WAITING", roomId: null, updatedAt: sql`now()` })
    .where(eq(sessions.id, sessionId))
    .returning();
  return session ?? null;
}

export async function dequeueSession(sessionId: string): Promise<Session | null> {
  const [session] = await db
    .update(sessions)
    .set({ status: "IDLE", roomId: null, updatedAt: sql`now()` })
    .where(eq(sessions.id, sessionId))
    .returning();
  return session ?? null;
}

export async function findMatch(sessionId: string): Promise<MatchResult | null> {
  return db.transaction(async (tx) => {
    const [self] = await tx
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1)
      .for("update");

    if (!self || self.status !== "WAITING") return null;

    const [candidate] = await tx
      .select()
      .from(sessions)
      .where(and(eq(sessions.status, "WAITING"), ne(sessions.id, sessionId)))
      .orderBy(asc(sessions.updatedAt))
      .limit(1)
      .for("update", { skipLocked: true });

    if (!candidate) return null;

    const [room] = await tx
      .insert(rooms)
      .values({ user1Id: self.id, user2Id: candidate.id })
      .returning();

    const [updatedSelf] = await tx
      .update(sessions)
      .set({ status: "CONNECTED", roomId: room.id, updatedAt: sql`now()` })
      .where(eq(sessions.id, self.id))
      .returning();

    const [updatedPeer] = await tx
      .update(sessions)
      .set({ status: "CONNECTED", roomId: room.id, updatedAt: sql`now()` })
      .where(eq(sessions.id, candidate.id))
      .returning();

    return { room, self: updatedSelf, peer: updatedPeer };
  });
}

export async function leaveRoom(sessionId: string): Promise<LeaveResult | null> {
  return db.transaction(async (tx) => {
    const [self] = await tx
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1)
      .for("update");

    if (!self?.roomId) return null;
    const roomId = self.roomId;

    const [room] = await tx.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);

    await tx
      .update(sessions)
      .set({ status: "IDLE", roomId: null, updatedAt: sql`now()` })
      .where(eq(sessions.roomId, roomId));

    await tx.delete(rooms).where(eq(rooms.id, roomId));

    if (!room) return { roomId, peer: null };

    const peerId = room.user1Id === sessionId ? room.user2Id : room.user1Id;
    const [peer] = await tx.select().from(sessions).where(eq(sessions.id, peerId)).limit(1);

    return { roomId, peer: peer ?? null };
  });
}

export async function destroySession(sessionId: string): Promise<LeaveResult | null> {
  const left = await leaveRoom(sessionId);
  await db.delete(sessions).where(eq(sessions.id, sessionId));
  return left;
}

export async function getPoolStats(): Promise<{ online: number; waiting: number }> {
  const [row] = await db
    .select({
      online: count(),
      waiting: count(sql`case when ${sessions.status} = 'WAITING' then 1 end`),
    })
    .from(sessions);
  return { online: Number(row?.online ?? 0), waiting: Number(row?.waiting ?? 0) };
}

export async function isRoomMember(roomId: string, sessionId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: rooms.id })
    .from(rooms)
    .where(and(eq(rooms.id, roomId), or(eq(rooms.user1Id, sessionId), eq(rooms.user2Id, sessionId))))
    .limit(1);
  return Boolean(row);
}
