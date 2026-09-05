# Strangr — anonymous 1‑on‑1 video & text chat

Omegle‑style random chat built with Next.js (App Router), TypeScript, Drizzle ORM + PostgreSQL,
Socket.io signaling and native browser WebRTC.

## Architecture

| Layer | File | Role |
| --- | --- | --- |
| Schema | `src/db/schema.ts` | `sessions` (UUID id, `socket_id`, `status` enum `IDLE/WAITING/CONNECTED`, `room_id`) and `rooms` (`user1_id`, `user2_id`) |
| Matching engine | `src/lib/matching.ts` | Pool queries: enqueue, `findMatch` (transaction + `FOR UPDATE SKIP LOCKED`), `leaveRoom`, `destroySession`, stats |
| Event contracts | `src/lib/socket-events.ts` | Explicitly typed `ServerToClientEvents` / `ClientToServerEvents` |
| Signaling | `src/lib/socket-server.ts` | Socket.io server: session lifecycle, matching, SDP/ICE relay, chat relay, skip/disconnect teardown |
| Custom server | `server.ts` | Next.js + Socket.io on one HTTP server (`npm start`) |
| Fallback | `src/pages/api/socket.ts` | Attaches Socket.io to Next's own server when run via plain `next start` |
| ICE config | `src/app/api/ice-servers/route.ts` | STUN by default; TURN via `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` env |
| UI | `src/app/chat/page.tsx` | Split‑screen video + chat, `RTCPeerConnection` / `getUserMedia` orchestration |

## Flow

1. Socket connects → server inserts an `IDLE` session.
2. `queue:join` → status `WAITING` → `findMatch` pairs with the longest‑waiting session, inserts a `Room`,
   sets both to `CONNECTED`, emits `match:found` (one side is the offer `initiator`).
3. Peers exchange `webrtc:offer` / `webrtc:answer` / `webrtc:ice-candidate` through the server; media flows P2P.
4. **Next** (`match:next`) or a disconnect deletes the `Room`, resets both sessions to `IDLE`,
   notifies the partner with `peer:left`, and (for Next) re‑enters the pool immediately.

## Scripts

- `npm run dev` — Next dev server (Socket.io attaches lazily through `/api/socket`)
- `npm run dev:server` — custom server in development
- `npm run build && npm start` — production build + custom server
- `npx drizzle-kit push` — apply the schema
