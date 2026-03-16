import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";

interface ClaudeTerminalProps {
  attachTo: (el: HTMLDivElement | null) => void;
  fit: () => void;
  ptyAlive: boolean;
  hasData: boolean;
  restart: () => void;
}

export function ClaudeTerminal({ attachTo, fit, ptyAlive, hasData, restart }: ClaudeTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Attach terminal to the container div
  useEffect(() => {
    if (containerRef.current) {
      attachTo(containerRef.current);
    }
    return () => attachTo(null);
  }, [attachTo]);

  // Resize terminal when container resizes (panel drag, window resize)
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(fit);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [fit]);

  // Re-fit when component mounts (tab switch makes it visible)
  useEffect(() => {
    const timer = setTimeout(fit, 50);
    return () => clearTimeout(timer);
  }, [fit]);

  // Listen for Enter to restart when PTY is dead
  useEffect(() => {
    if (ptyAlive) return;
    const el = containerRef.current;
    if (!el) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        restart();
      }
    };
    el.addEventListener("keydown", handler);
    return () => el.removeEventListener("keydown", handler);
  }, [ptyAlive, restart]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#1a1a1a]">
      <div ref={containerRef} className="h-full w-full" />
      {!hasData && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-3 text-zinc-500">
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>Starting Claude Code...</span>
          </div>
        </div>
      )}
    </div>
  );
}
