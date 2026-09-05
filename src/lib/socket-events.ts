export const SOCKET_PATH = "/api/socketio";

export type ChatSender = "you" | "stranger" | "system";

export interface ChatMessage {
  id: string;
  sender: ChatSender;
  text: string;
  sentAt: number;
}

export interface MatchFoundPayload {
  roomId: string;
  peerId: string;
  initiator: boolean;
}

export interface OnlineStatsPayload {
  online: number;
  waiting: number;
}

export type PeerLeftReason = "skipped" | "disconnected";

export interface ServerToClientEvents {
  "session:ready": (payload: { sessionId: string }) => void;
  "queue:waiting": () => void;
  "queue:idle": () => void;
  "match:found": (payload: MatchFoundPayload) => void;
  "peer:left": (payload: { reason: PeerLeftReason }) => void;

  "webrtc:offer": (payload: { sdp: RTCSessionDescriptionInit }) => void;
  "webrtc:answer": (payload: { sdp: RTCSessionDescriptionInit }) => void;
  "webrtc:ice-candidate": (payload: { candidate: RTCIceCandidateInit }) => void;

  "chat:message": (payload: { id: string; text: string; sentAt: number }) => void;
  "chat:typing": (payload: { typing: boolean }) => void;

  "stats:online": (payload: OnlineStatsPayload) => void;
  "server:error": (payload: { message: string }) => void;
}

export interface ClientToServerEvents {
  "queue:join": () => void;
  "queue:leave": () => void;
  "match:next": () => void;

  "webrtc:offer": (payload: { sdp: RTCSessionDescriptionInit }) => void;
  "webrtc:answer": (payload: { sdp: RTCSessionDescriptionInit }) => void;
  "webrtc:ice-candidate": (payload: { candidate: RTCIceCandidateInit }) => void;

  "chat:message": (payload: { text: string }) => void;
  "chat:typing": (payload: { typing: boolean }) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  sessionId: string;
  roomId: string | null;
}

export const MAX_MESSAGE_LENGTH = 2000;
