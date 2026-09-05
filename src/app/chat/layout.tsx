import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Chat with a stranger · Strangr",
  description: "Anonymous 1-on-1 video and text chat with a random stranger.",
};

export default function ChatLayout({ children }: { children: ReactNode }) {
  return children;
}
