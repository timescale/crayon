import { useState } from "react";
import type { VersionEntry } from "../types";

interface VersionsSectionProps {
  versions: VersionEntry[];
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function VersionCard({ version }: { version: VersionEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`rounded-lg border transition-colors ${
        expanded ? "border-[#e8e4df] bg-white" : "border-transparent hover:bg-[#faf9f7]"
      }`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-3 py-2 flex items-start gap-2 cursor-pointer"
      >
        <span className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#a8a099]">
          {expanded ? <ChevronDown /> : <ChevronRight />}
        </span>
        <div className="flex-1 min-w-0">
          <p className={`text-[12px] text-[#1a1a1a] leading-snug ${expanded ? "" : "truncate"}`}>
            {version.message}
          </p>
          <span className="text-[11px] text-[#a8a099]">
            {timeAgo(version.date)}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[#e8e4df] px-3 py-2.5 ml-[22px]">
          {version.body && (
            <pre className="text-[11px] text-[#787068] whitespace-pre-wrap font-sans leading-relaxed mb-2">
              {version.body}
            </pre>
          )}
          <div className="text-[10px] text-[#a8a099]">
            {new Date(version.date).toLocaleString()} · Version ID: {version.hashShort}
          </div>
        </div>
      )}
    </div>
  );
}

export function VersionsSection({ versions }: VersionsSectionProps) {
  return (
    <div className="p-3 border-t border-[#e8e4df]">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] uppercase tracking-wider text-[#a8a099] font-medium">
          {versions.length} version{versions.length !== 1 ? "s" : ""}
        </span>
      </div>

      {versions.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-[11px] text-[#a8a099]">No versions yet</p>
        </div>
      ) : (
        <>
          <div className="space-y-1">
            {versions.map((v) => (
              <VersionCard key={v.hash} version={v} />
            ))}
          </div>
          <p className="text-[10px] text-[#a8a099] mt-3 text-center italic flex items-center justify-center gap-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            Ask Claude to restore a previous version
          </p>
        </>
      )}
    </div>
  );
}
