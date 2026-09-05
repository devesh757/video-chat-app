import Link from "next/link";
import { getPoolStats } from "@/lib/matching";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const stats = await getPoolStats().catch(() => ({ online: 0, waiting: 0 }));

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-indigo-600/30 blur-3xl" />
        <div className="absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-fuchsia-600/20 blur-3xl" />
      </div>

      <header className="flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-500">S</span>
          Strangr
        </div>
        <span className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 text-xs text-zinc-300 ring-1 ring-white/10">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          {stats.online} online now
        </span>
      </header>

      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 pb-20 text-center">
        <p className="mb-4 rounded-full bg-indigo-500/15 px-3 py-1 text-xs font-medium text-indigo-300 ring-1 ring-indigo-500/30">
          Anonymous · Peer-to-peer · Nothing stored
        </p>
        <h1 className="text-balance text-5xl font-extrabold tracking-tight sm:text-6xl">
          Talk to <span className="bg-gradient-to-r from-indigo-400 to-fuchsia-400 bg-clip-text text-transparent">strangers</span>
          , instantly.
        </h1>
        <p className="mt-5 max-w-xl text-pretty text-base text-zinc-400 sm:text-lg">
          One click drops you into a random 1-on-1 video and text chat. Don&apos;t vibe? Hit{" "}
          <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-sm text-zinc-200">Esc</kbd> and
          meet the next person.
        </p>

        <Link
          href="/chat"
          className="mt-10 inline-flex items-center gap-2 rounded-2xl bg-indigo-500 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-400 hover:shadow-indigo-400/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
        >
          Start chatting
          <span aria-hidden>→</span>
        </Link>

        <ul className="mt-14 grid w-full gap-4 text-left sm:grid-cols-3">
          {[
            ["🎥", "Video + text", "WebRTC streams directly between browsers — the server only brokers the handshake."],
            ["🕵️", "Fully anonymous", "No sign-up. Sessions are throwaway UUIDs deleted the moment you leave."],
            ["⚡", "Instant matching", "A type-safe matching engine pairs you with the longest-waiting stranger."],
          ].map(([icon, title, body]) => (
            <li key={title} className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
              <div className="text-2xl">{icon}</div>
              <h3 className="mt-2 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-zinc-400">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      <footer className="px-6 py-4 text-center text-xs text-zinc-600">
        You must be 18+ to use this service. Be kind to strangers.
      </footer>
    </main>
  );
}
