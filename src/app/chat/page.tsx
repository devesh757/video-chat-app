"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { MessagePanel } from "@/components/chat/MessagePanel";
import { VideoTile } from "@/components/chat/VideoTile";
import {
  SOCKET_PATH,
  type ChatMessage,
  type ClientToServerEvents,
  type OnlineStatsPayload,
  type ServerToClientEvents,
} from "@/lib/socket-events";

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

type Phase =
  | "media"
  | "idle"
  | "waiting"
  | "connected"
  | "peer-left";

const PHASE_LABEL: Record<Phase, string> = {
  media: "Setting up",
  idle: "Idle",
  waiting: "Searching…",
  connected: "Connected",
  "peer-left": "Stranger left",
};

const PHASE_DOT: Record<Phase, string> = {
  media: "bg-zinc-400",
  idle: "bg-zinc-400",
  waiting: "bg-amber-400 animate-pulse",
  connected: "bg-emerald-400",
  "peer-left": "bg-rose-400",
};

let msgCounter = 0;
const makeMessage = (sender: ChatMessage["sender"], text: string, id?: string): ChatMessage => ({
  id: id ?? `${Date.now()}-${msgCounter++}`,
  sender,
  text,
  sentAt: Date.now(),
});

export default function ChatPage() {
  const [phase, setPhase] = useState<Phase>("media");
  const [socketConnected, setSocketConnected] = useState(false);
  const [stats, setStats] = useState<OnlineStatsPayload>({ online: 0, waiting: 0 });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [strangerTyping, setStrangerTyping] = useState(false);
  const [hasLocalStream, setHasLocalStream] = useState(false);
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  const socketRef = useRef<TypedSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const iceServersRef = useRef<RTCIceServer[]>([{ urls: "stun:stun.l.google.com:19302" }]);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const phaseRef = useRef<Phase>("media");

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const addSystemMessage = useCallback((text: string) => {
    setMessages((prev) => [...prev, makeMessage("system", text)]);
  }, []);

  const closePeerConnection = useCallback(() => {
    const pc = pcRef.current;
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.getSenders().forEach((s) => {
        try {
          pc.removeTrack(s);
        } catch {
        }
      });
      pc.close();
    }
    pcRef.current = null;
    pendingCandidatesRef.current = [];
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setHasRemoteStream(false);
    setStrangerTyping(false);
  }, []);

  const flushPendingCandidates = useCallback(async (pc: RTCPeerConnection) => {
    const queued = pendingCandidatesRef.current;
    pendingCandidatesRef.current = [];
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(candidate);
      } catch (err) {
        console.warn("[webrtc] failed to add queued candidate", err);
      }
    }
  }, []);

  const makeOffer = useCallback(async (pc: RTCPeerConnection) => {
    try {
      if (pc.signalingState !== "stable") return;
      const offer = await pc.createOffer();
      if (pc.signalingState !== "stable") return;
      await pc.setLocalDescription(offer);
      const local = pc.localDescription;
      if (local) socketRef.current?.emit("webrtc:offer", { sdp: local });
    } catch (err) {
      console.error("[webrtc] offer failed", err);
    }
  }, []);

  const createPeerConnection = useCallback(
    (initiator: boolean): RTCPeerConnection => {
      closePeerConnection();
      const socket = socketRef.current;
      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
      pcRef.current = pc;

      const stream = localStreamRef.current;
      let sentTracks = false;
      const addLocalTracks = () => {
        const s = localStreamRef.current;
        if (!s || sentTracks) return;
        s.getTracks().forEach((track) => pc.addTrack(track, s));
        sentTracks = true;
      };

      if (initiator && stream) {
        // Initiator: send local media from the start; the offer is driven by onnegotiationneeded.
        addLocalTracks();
      } else {
        pc.addTransceiver("video", { direction: "recvonly" });
        pc.addTransceiver("audio", { direction: "recvonly" });
      }

      pc.onnegotiationneeded = () => {
        if (pc.signalingState !== "stable") return;
        void makeOffer(pc);
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit("webrtc:ice-candidate", { candidate: event.candidate.toJSON() });
        }
      };

      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        const el = remoteVideoRef.current;
        if (!el) return;
        if (remoteStream) {
          if (el.srcObject !== remoteStream) el.srcObject = remoteStream;
        } else {
          const existing = (el.srcObject as MediaStream | null) ?? new MediaStream();
          existing.addTrack(event.track);
          el.srcObject = existing;
        }
        setHasRemoteStream(true);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          // Once P2P is up, the non-initiator sends its own tracks via a fresh
          // negotiation, so both sides see and hear each other.
          addLocalTracks();
        }
        if (pc.connectionState === "failed") {
          addSystemMessage("Video connection failed (a firewall may be blocking P2P). Text chat still works.");
        }
      };

      // No local media to negotiate (text-only initiator): still kick off an empty offer so
      // the peer can establish the connection and later send its own media.
      if (initiator && !stream) {
        setTimeout(() => void makeOffer(pc), 0);
      }

      return pc;
    },
    [addSystemMessage, closePeerConnection, makeOffer],
  );

  useEffect(() => {
    let cancelled = false;

    const acquireMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        setHasLocalStream(true);
      } catch (err) {
        console.warn("[media] getUserMedia failed", err);
        setMediaError("Camera/microphone unavailable — continuing in text-only mode.");
      }
    };

    const loadIceServers = async () => {
      try {
        const res = await fetch("/api/ice-servers");
        const data = (await res.json()) as { iceServers?: RTCIceServer[] };
        if (data.iceServers?.length) iceServersRef.current = data.iceServers;
      } catch {
      }
    };

    const connectSocket = async () => {
      await fetch("/api/socket").catch(() => undefined);
      if (cancelled) return;

      const socket: TypedSocket = io({
        path: SOCKET_PATH,
        transports: ["websocket", "polling"],
        reconnectionAttempts: Infinity,
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        setSocketConnected(true);
        setPhase("waiting");
        socket.emit("queue:join");
      });

      socket.on("disconnect", () => {
        setSocketConnected(false);
        closePeerConnection();
        setPhase("idle");
        addSystemMessage("Lost connection to the server. Reconnecting…");
      });

      socket.on("queue:waiting", () => setPhase("waiting"));
      socket.on("queue:idle", () => setPhase("idle"));
      socket.on("stats:online", setStats);
      socket.on("server:error", ({ message }) => addSystemMessage(message));

      socket.on("match:found", ({ initiator }) => {
        setMessages([makeMessage("system", "You're now chatting with a random stranger. Say hi!")]);
        setPhase("connected");
        createPeerConnection(initiator);
      });

      socket.on("webrtc:offer", async ({ sdp }) => {
        const pc = pcRef.current ?? createPeerConnection(false);
        try {
          if (pc.signalingState !== "stable") return;
          await pc.setRemoteDescription(sdp);
          await flushPendingCandidates(pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("webrtc:answer", { sdp: answer });
        } catch (err) {
          console.error("[webrtc] handling offer failed", err);
        }
      });

      socket.on("webrtc:answer", async ({ sdp }) => {
        const pc = pcRef.current;
        if (!pc) return;
        try {
          if (pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(sdp);
            await flushPendingCandidates(pc);
          }
        } catch (err) {
          console.error("[webrtc] handling answer failed", err);
        }
      });

      socket.on("webrtc:ice-candidate", async ({ candidate }) => {
        const pc = pcRef.current;
        if (!pc || !pc.remoteDescription) {
          pendingCandidatesRef.current.push(candidate);
          return;
        }
        try {
          await pc.addIceCandidate(candidate);
        } catch (err) {
          console.warn("[webrtc] addIceCandidate failed", err);
        }
      });

      socket.on("peer:left", ({ reason }) => {
        closePeerConnection();
        setPhase("peer-left");
        addSystemMessage(
          reason === "skipped" ? "Stranger skipped to someone else." : "Stranger has disconnected.",
        );
      });

      socket.on("chat:message", ({ id, text }) => {
        setStrangerTyping(false);
        setMessages((prev) => [...prev, makeMessage("stranger", text, id)]);
      });

      socket.on("chat:typing", ({ typing }) => setStrangerTyping(typing));
    };

    void (async () => {
      await Promise.allSettled([acquireMedia(), loadIceServers()]);
      if (cancelled) return;
      setPhase("idle");
      await connectSocket();
    })();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
      closePeerConnection();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    };
  }, [addSystemMessage, closePeerConnection, createPeerConnection, flushPendingCandidates]);

  const handleNext = useCallback(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    closePeerConnection();
    if (phaseRef.current === "connected") addSystemMessage("You skipped. Looking for a new stranger…");
    setPhase("waiting");
    socket.emit("match:next");
  }, [addSystemMessage, closePeerConnection]);

  const handleStop = useCallback(() => {
    const socket = socketRef.current;
    closePeerConnection();
    setPhase("idle");
    socket?.emit("queue:leave");
  }, [closePeerConnection]);

  const handleStart = useCallback(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    setPhase("waiting");
    socket.emit("queue:join");
  }, []);

  const handleSend = useCallback((text: string) => {
    const socket = socketRef.current;
    if (!socket?.connected || phaseRef.current !== "connected") return;
    socket.emit("chat:message", { text });
    setMessages((prev) => [...prev, makeMessage("you", text)]);
  }, []);

  const handleTyping = useCallback((typing: boolean) => {
    socketRef.current?.emit("chat:typing", { typing });
  }, []);

  const toggleMic = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !micOn;
    stream.getAudioTracks().forEach((t) => (t.enabled = next));
    setMicOn(next);
  };

  const toggleCam = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !camOn;
    stream.getVideoTracks().forEach((t) => (t.enabled = next));
    setCamOn(next);
  };

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "TEXTAREA" || target?.tagName === "INPUT") return;
      if (phaseRef.current === "connected" || phaseRef.current === "peer-left") handleNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleNext]);

  const remotePlaceholder = (() => {
    switch (phase) {
      case "media":
        return <span>Requesting camera & microphone…</span>;
      case "idle":
        return <span>{socketConnected ? "Press Start to meet a stranger" : "Connecting to server…"}</span>;
      case "waiting":
        return (
          <span className="flex flex-col items-center gap-3">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-indigo-400" />
            Looking for a stranger…
          </span>
        );
      case "connected":
        return (
          <span className="flex flex-col items-center gap-3">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-400" />
            Connecting video…
          </span>
        );
      case "peer-left":
        return <span>Stranger left. Press Next to find someone new.</span>;
    }
  })();

  const primaryAction =
    phase === "idle" ? (
      <button
        onClick={handleStart}
        disabled={!socketConnected}
        className="rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-40"
      >
        Start
      </button>
    ) : (
      <button
        onClick={handleNext}
        disabled={!socketConnected || phase === "media"}
        className="rounded-xl bg-indigo-500 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-40"
        title="Skip to the next stranger (Esc)"
      >
        {phase === "waiting" ? "Searching…" : "Next"}
        <span className="ml-2 hidden rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-medium sm:inline">Esc</span>
      </button>
    );

  return (
    <div className="flex h-dvh flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-base font-bold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-500 text-sm">S</span>
          Strangr
        </Link>
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <span className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1">
            <span className={`h-2 w-2 rounded-full ${PHASE_DOT[phase]}`} />
            {PHASE_LABEL[phase]}
          </span>
          <span className="hidden sm:inline">
            <strong className="text-zinc-200">{stats.online}</strong> online ·{" "}
            <strong className="text-zinc-200">{stats.waiting}</strong> waiting
          </span>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-3 p-3 lg:grid lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="flex h-[46dvh] flex-col gap-3 lg:h-auto lg:min-h-0">
          <div className="relative grid min-h-0 flex-1 gap-3 lg:grid-rows-2">
            <VideoTile
              ref={remoteVideoRef}
              label="Stranger"
              showPlaceholder={!hasRemoteStream}
              placeholder={remotePlaceholder}
              className="min-h-0"
            />
            <VideoTile
              ref={localVideoRef}
              label="You"
              muted={true}
              mirrored
              showPlaceholder={!hasLocalStream || !camOn}
              placeholder={
                <span className="text-xs">
                  {mediaError ? "No camera" : !camOn ? "Camera off" : "Starting camera…"}
                </span>
              }
              className="absolute bottom-3 right-3 z-10 aspect-[3/4] w-24 shadow-xl sm:w-32 lg:static lg:aspect-auto lg:w-auto lg:min-h-0 lg:shadow-none"
            >
              {!micOn && (
                <span className="absolute bottom-2 right-2 rounded-full bg-rose-500/90 px-2 py-0.5 text-[10px] font-semibold">
                  Muted
                </span>
              )}
            </VideoTile>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-zinc-900 px-3 py-2.5 ring-1 ring-white/10">
            <div className="flex items-center gap-2">
              <ControlButton onClick={toggleMic} active={micOn} disabled={!hasLocalStream} label={micOn ? "Mute" : "Unmute"}>
                {micOn ? "🎙️" : "🔇"}
              </ControlButton>
              <ControlButton onClick={toggleCam} active={camOn} disabled={!hasLocalStream} label={camOn ? "Camera off" : "Camera on"}>
                {camOn ? "📷" : "🚫"}
              </ControlButton>
            </div>
            <div className="flex items-center gap-2">
              {phase !== "idle" && phase !== "media" && (
                <button
                  onClick={handleStop}
                  className="rounded-xl bg-white/5 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-white/10"
                >
                  Stop
                </button>
              )}
              {primaryAction}
            </div>
          </div>

          {mediaError && (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              {mediaError}
            </p>
          )}
        </section>

        <section className="min-h-0 flex-1 lg:h-auto">
          <MessagePanel
            messages={messages}
            canSend={phase === "connected"}
            strangerTyping={strangerTyping}
            onSend={handleSend}
            onTyping={handleTyping}
          />
        </section>
      </main>
    </div>
  );
}

function ControlButton({
  children,
  onClick,
  active,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`grid h-10 w-10 place-items-center rounded-xl text-base transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "bg-white/5 hover:bg-white/10" : "bg-rose-500/20 ring-1 ring-rose-500/50 hover:bg-rose-500/30"
      }`}
    >
      {children}
    </button>
  );
}
