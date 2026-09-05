"use client";

import { useEffect, useRef, useState, useCallback, type FormEvent, type KeyboardEvent } from "react";
import type { ChatMessage } from "@/lib/socket-events";
import { MAX_MESSAGE_LENGTH } from "@/lib/socket-events";

interface MessagePanelProps {
  messages: ChatMessage[];
  canSend: boolean;
  strangerTyping: boolean;
  onSend: (text: string) => void;
  onTyping: (typing: boolean) => void;
}

export function MessagePanel({ messages, canSend, strangerTyping, onSend, onTyping }: MessagePanelProps) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTyping = useRef(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, strangerTyping]);

  const stopTyping = useCallback(() => {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = null;
    if (isTyping.current) {
      isTyping.current = false;
      onTyping(false);
    }
  }, [onTyping]);

  useEffect(() => {
    if (!canSend) {
      stopTyping();
    }
  }, [canSend, stopTyping]);

  const handleChange = (value: string) => {
    setDraft(value);
    if (!canSend) return;
    if (!isTyping.current) {
      isTyping.current = true;
      onTyping(true);
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(stopTyping, 1500);
  };

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || !canSend) return;
    onSend(text.slice(0, MAX_MESSAGE_LENGTH));
    setDraft("");
    stopTyping();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl bg-zinc-900 ring-1 ring-white/10">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-200">Chat</h2>
        <span className="text-xs text-zinc-500">Anonymous · not stored</span>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <p className="pt-8 text-center text-sm text-zinc-500">
            Messages with your stranger will appear here.
          </p>
        )}
        {messages.map((m) =>
          m.sender === "system" ? (
            <p key={m.id} className="py-1 text-center text-xs italic text-zinc-500">
              {m.text}
            </p>
          ) : (
            <div key={m.id} className={`flex ${m.sender === "you" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                  m.sender === "you"
                    ? "rounded-br-md bg-indigo-500 text-white"
                    : "rounded-bl-md bg-zinc-800 text-zinc-100"
                }`}
              >
                <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide opacity-70">
                  {m.sender === "you" ? "You" : "Stranger"}
                </span>
                {m.text}
              </div>
            </div>
          ),
        )}
        {strangerTyping && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-zinc-800 px-3.5 py-2.5">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" />
            </div>
          </div>
        )}
      </div>

      <form onSubmit={submit} className="border-t border-white/10 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={!canSend}
            rows={1}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder={canSend ? "Type a message… (Enter to send)" : "Connect with a stranger to chat"}
            className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!canSend || !draft.trim()}
            className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
