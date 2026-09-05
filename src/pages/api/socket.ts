import type { Server as HttpServer } from "node:http";
import type { Socket as NetSocket } from "node:net";
import type { NextApiRequest, NextApiResponse } from "next";
import { attachSocketServer } from "@/lib/socket-server";
import { SOCKET_PATH } from "@/lib/socket-events";

type ResponseWithServer = NextApiResponse & {
  socket: NetSocket & { server: HttpServer };
};

export const config = { api: { bodyParser: false } };

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const server = (res as ResponseWithServer).socket?.server;
  if (!server) {
    res.status(500).json({ ok: false, error: "HTTP server unavailable" });
    return;
  }
  attachSocketServer(server);
  res.status(200).json({ ok: true, path: SOCKET_PATH });
}
