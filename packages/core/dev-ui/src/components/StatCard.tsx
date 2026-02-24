import type { ReactNode } from "react";

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
}

export function StatCard({ icon, label, value }: StatCardProps) {
  return (
    <div className="bg-card rounded-xl border border-border px-5 py-4 flex-1 min-w-0">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wider mb-2">
        <span className="shrink-0 opacity-70">{icon}</span>
        {label}
      </div>
      <div className="text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}
