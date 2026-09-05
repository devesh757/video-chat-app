"use client";

import { forwardRef, type ReactNode } from "react";

interface VideoTileProps {
  label: string;
  muted?: boolean;
  mirrored?: boolean;
  placeholder?: ReactNode;
  showPlaceholder: boolean;
  className?: string;
  children?: ReactNode;
}

export const VideoTile = forwardRef<HTMLVideoElement, VideoTileProps>(function VideoTile(
  { label, muted = false, mirrored = false, placeholder, showPlaceholder, className = "", children },
  ref,
) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-white/10 ${className}`}
    >
      <video
        ref={ref}
        autoPlay={true}
        playsInline={true}
        muted={muted}
        className={`h-full w-full object-cover transition-opacity duration-300 ${
          showPlaceholder ? "opacity-0" : "opacity-100"
        } ${mirrored ? "-scale-x-100" : ""}`}
      />
      {showPlaceholder && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-950 p-4 text-center text-sm text-zinc-400">
          {placeholder}
        </div>
      )}
      <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
        {label}
      </span>
      {children}
    </div>
  );
});
