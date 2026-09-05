import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Strangr — Talk to strangers",
  description:
    "Anonymous, peer-to-peer 1-on-1 video and text chat with random strangers. No account, nothing stored.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
