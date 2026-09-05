import type { Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import { Server, type Socket } from "socket.io";
import {
  MAX_MESSAGE_LENGTH,
  SOCKET_PATH,
  type ClientToServerEvents,
  type InterServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from "./socket-events";

import {
  createSession,
  destroySession,
  dequeueSession,
  enqueueSession,
  findMatch,
  getPoolStats,
  leaveRoom,
  resetAllSessions,
} from "./matching";

export type SignalingServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export type SignalingSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

type ServerWithIO = HttpServer & { __signalingIO?: SignalingServer };

export function attachSocketServer(httpServer: HttpServer): SignalingServer {
  const target = httpServer as ServerWithIO;
  if (target.__signalingIO) return target.__signalingIO;

  const io: SignalingServer = new Server(httpServer, {
    path: SOCKET_PATH,
    addTrailingSlash: false,
    cors: { origin: true, credentials: true },
    maxHttpBufferSize: 256 * 1024,
  });
  target.__signalingIO = io;

  const ready = resetAllSessions().catch((err) => {
    console.error("[signaling] failed to reset stale sessions", err);
  });

  const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "https://video-chat-app-gold.vercel.app" // Insert your live Vercel production URL here
];

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket"] // Forces clean WebSocket initialization upgrades
});

  // Serialize ALL matching operations so that concurrent findMatch calls
  // cannot deadlock (both lock their own rows, skip each other's candidate,
  // and both return null). Only one findMatch runs at a time, so the
  // later claimant always sees the other peer's committed WAITING status.
  let matchChain: Promise<void> = Promise.resolve();

  // Create the session in middleware so `socket.data.sessionId` is always set
  // before the connection event and before any client events are dispatched.
  // Otherwise the client's first `queue:join` can arrive before the connection
  // handler registers its listeners and silently get dropped.
  io.use(async (socket, next) => {
    await ready;
    try {
      const session = await createSession(socket.id);
      socket.data.sessionId = session.id;
      socket.data.roomId = null;
    } catch (err) {
      console.error("[signaling] failed to create session", err);
      next(new Error("Could not create a session. Please reload."));
      return;
    }
    next();
  });

  const broadcastStats = async () => {
    try {
      io.emit("stats:online", await getPoolStats());
    } catch (err) {
      console.error("[signaling] stats error", err);
    }
  };

  const attemptMatch = async (socket: SignalingSocket): Promise<boolean> => {
    const task = matchChain.then(async () => {
      const result = await findMatch(socket.data.sessionId);
      if (!result) {
        if (!socket.data.roomId) socket.emit("queue:waiting");
        return false;
      }

      const peerSocket = io.sockets.sockets.get(result.peer.socketId);
      if (!peerSocket?.connected) {
        await leaveRoom(socket.data.sessionId);
        await enqueueSession(socket.data.sessionId);
        if (!socket.data.roomId) socket.emit("queue:waiting");
        return false;
      }

      const roomId = result.room.id;
      socket.data.roomId = roomId;
      peerSocket.data.roomId = roomId;
      await Promise.all([socket.join(roomId), peerSocket.join(roomId)]);

      socket.emit("match:found", { roomId, peerId: result.peer.id, initiator: true });
      peerSocket.emit("match:found", { roomId, peerId: result.self.id, initiator: false });
      return true;
    });
    matchChain = task.then(() => undefined, () => undefined);
    return task;
  };

  // Two peers can join around the same time and each run findMatch before the
  // other's WAITING status is committed to the DB, leaving both waiting forever.
  // Retry with jittered delays: when both retry in lockstep, each findMatch
  // transaction locks its own row and SKIP LOCKED skips the other's locked row,
  // so both keep failing forever. Jitter breaks that symmetry.
  const settleMatch = async (socket: SignalingSocket): Promise<void> => {
    for (let attempt = 0; attempt < 4; attempt++) {
      if (socket.data.roomId || !socket.connected) return;
      if (await attemptMatch(socket)) return;
      if (attempt < 3) {
        const delay = 600 + Math.floor(Math.random() * 900);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  };

  const exitRoom = async (socket: SignalingSocket, reason: "skipped" | "disconnected") => {
    const left = await leaveRoom(socket.data.sessionId);
    const roomId = left?.roomId ?? socket.data.roomId;
    socket.data.roomId = null;
    if (!roomId) return;

    await socket.leave(roomId);

    if (left?.peer) {
      const peerSocket = io.sockets.sockets.get(left.peer.socketId);
      if (peerSocket?.connected) {
        peerSocket.data.roomId = null;
        await peerSocket.leave(roomId);
        peerSocket.emit("peer:left", { reason });
      }
    }
  };

  const registerRelays = (socket: SignalingSocket) => {
    socket.on("webrtc:offer", ({ sdp }) => {
      const roomId = socket.data.roomId;
      if (!roomId || !sdp) return;
      socket.to(roomId).emit("webrtc:offer", { sdp });
    });

    socket.on("webrtc:answer", ({ sdp }) => {
      const roomId = socket.data.roomId;
      if (!roomId || !sdp) return;
      socket.to(roomId).emit("webrtc:answer", { sdp });
    });

    socket.on("webrtc:ice-candidate", ({ candidate }) => {
      const roomId = socket.data.roomId;
      if (!roomId || !candidate) return;
      socket.to(roomId).emit("webrtc:ice-candidate", { candidate });
    });

    socket.on("chat:typing", ({ typing }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      socket.to(roomId).emit("chat:typing", { typing: Boolean(typing) });
    });
  };

  io.on("connection", (socket) => {
    socket.emit("session:ready", { sessionId: socket.data.sessionId });
    void broadcastStats();

    let chain: Promise<void> = Promise.resolve();
    const serial = (fn: () => Promise<void>) => {
      chain = chain.then(fn).catch((err) => {
        socket.emit("server:error", { message: "Something went wrong. Try again." });
      });
      return chain;
    };

    socket.on("queue:join", () =>
      serial(async () => {
        await exitRoom(socket, "skipped");
        await enqueueSession(socket.data.sessionId);
        await settleMatch(socket);
        void broadcastStats();
      }),
    );

    socket.on("match:next", () =>
      serial(async () => {
        await exitRoom(socket, "skipped");
        await enqueueSession(socket.data.sessionId);
        await settleMatch(socket);
        void broadcastStats();
      }),
    );

    socket.on("queue:leave", () =>
      serial(async () => {
        await exitRoom(socket, "skipped");
        await dequeueSession(socket.data.sessionId);
        socket.emit("queue:idle");
        void broadcastStats();
      }),
    );

    registerRelays(socket);

    socket.on("chat:message", ({ text }) => {
      const roomId = socket.data.roomId;
      if (!roomId || typeof text !== "string") return;
      const clean = text.trim().slice(0, MAX_MESSAGE_LENGTH);
      if (!clean) return;
      socket.to(roomId).emit("chat:message", { id: randomUUID(), text: clean, sentAt: Date.now() });
    });

    socket.on("disconnect", () =>
      serial(async () => {
        const left = await destroySession(socket.data.sessionId);
        if (left?.peer) {
          const peerSocket = io.sockets.sockets.get(left.peer.socketId);
          if (peerSocket?.connected) {
            peerSocket.data.roomId = null;
            await peerSocket.leave(left.roomId);
            peerSocket.emit("peer:left", { reason: "disconnected" });
          }
        }
        void broadcastStats();
      }),
    );
  });

  console.log(`[signaling] Socket.io attached at ${SOCKET_PATH}`);
  return io;
}
