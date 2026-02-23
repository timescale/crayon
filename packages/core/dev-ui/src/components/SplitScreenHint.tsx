import { useEffect, useCallback, useRef } from "react";

interface SplitScreenHintProps {
  onClose: () => void;
}

export function SplitScreenHint({ onClose }: SplitScreenHintProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  // Auto-close after animation
  useEffect(() => {
    const timer = setTimeout(onClose, 4500);
    return () => clearTimeout(timer);
  }, [onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) onClose();
    },
    [onClose],
  );

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ animation: "ssh-backdrop 4.5s ease both" }}
    >
      {/* Schematic screen */}
      <div
        className="relative w-[480px] h-[300px] rounded-xl border-2 border-foreground/20 bg-card shadow-2xl overflow-hidden"
        style={{ animation: "ssh-screen 4.5s ease both" }}
      >
        {/* Left pane — Claude Code terminal */}
        <div
          className="absolute inset-y-0 left-0 w-1/2 flex flex-col items-center justify-center gap-3"
          style={{ animation: "ssh-pane-left 4.5s ease both" }}
        >
          <div className="w-10 h-10 rounded-lg bg-[#1a1a1a] flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e8e4df" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-foreground">Claude Code</span>
          <span className="text-[10px] text-muted-foreground">Your terminal</span>
        </div>

        {/* Divider line */}
        <div
          className="absolute top-0 left-1/2 w-[2px] h-full bg-foreground/15 -translate-x-1/2"
          style={{ animation: "ssh-divider 4.5s ease both" }}
        />

        {/* Right pane — 0pflow canvas */}
        <div
          className="absolute inset-y-0 right-0 w-1/2 flex flex-col items-center justify-center gap-3"
          style={{ animation: "ssh-pane-right 4.5s ease both" }}
        >
          <div className="w-10 h-10 rounded-lg bg-[#f3ede5] border border-border flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-foreground">
              <rect x="3" y="3" width="7" height="5" rx="1.5" />
              <rect x="14" y="3" width="7" height="5" rx="1.5" />
              <rect x="8.5" y="16" width="7" height="5" rx="1.5" />
              <path d="M6.5 8v3.5a2 2 0 002 2h7a2 2 0 002-2V8" />
              <path d="M12 13.5V16" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-foreground">0pflow</span>
          <span className="text-[10px] text-muted-foreground">This browser</span>
        </div>

        {/* "Copied to clipboard" banner */}
        <div
          className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-foreground text-background text-[11px] font-medium px-3 py-1 rounded-full"
          style={{ animation: "ssh-banner 4.5s ease both" }}
        >
          Copied to clipboard
        </div>
      </div>

      <style>{`
        @keyframes ssh-backdrop {
          0% { background: rgba(0,0,0,0); }
          5% { background: rgba(0,0,0,0.2); }
          88% { background: rgba(0,0,0,0.2); }
          100% { background: rgba(0,0,0,0); }
        }
        @keyframes ssh-screen {
          0% { opacity: 0; transform: scale(0.95); }
          5% { opacity: 1; transform: scale(1); }
          88% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.97); }
        }
        @keyframes ssh-divider {
          0%, 7% { transform: translateX(-50%) scaleY(0); }
          17% { transform: translateX(-50%) scaleY(1); }
          88% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes ssh-pane-left {
          0%, 15% { opacity: 0; }
          25% { opacity: 1; }
          88% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes ssh-pane-right {
          0%, 20% { opacity: 0; }
          30% { opacity: 1; }
          88% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes ssh-banner {
          0%, 5% { opacity: 0; transform: translateX(-50%) translateY(8px); }
          12% { opacity: 1; transform: translateX(-50%) translateY(0); }
          75% { opacity: 1; }
          88% { opacity: 0; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
