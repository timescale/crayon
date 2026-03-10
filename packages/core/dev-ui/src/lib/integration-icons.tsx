import type { ReactNode } from "react";

const size = 16;

const icons: Record<string, ReactNode> = {
  slack: (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M14.5 2a2.5 2.5 0 0 0 0 5H17V4.5A2.5 2.5 0 0 0 14.5 2z" fill="#E01E5A" />
      <path d="M2 14.5a2.5 2.5 0 0 0 5 0V12H4.5A2.5 2.5 0 0 0 2 14.5z" fill="#36C5F0" />
      <path d="M9.5 2a2.5 2.5 0 0 0 0 5h2.5V4.5A2.5 2.5 0 0 0 9.5 2z" fill="#36C5F0" />
      <path d="M2 9.5A2.5 2.5 0 0 0 4.5 12H7V9.5A2.5 2.5 0 0 0 4.5 7 2.5 2.5 0 0 0 2 9.5z" fill="#2EB67D" />
      <path d="M17 9.5A2.5 2.5 0 0 0 19.5 7 2.5 2.5 0 0 0 22 9.5a2.5 2.5 0 0 0-2.5 2.5H17V9.5z" fill="#ECB22E" />
      <path d="M9.5 17a2.5 2.5 0 0 0-2.5 2.5A2.5 2.5 0 0 0 9.5 22a2.5 2.5 0 0 0 2.5-2.5V17H9.5z" fill="#E01E5A" />
      <path d="M14.5 12a2.5 2.5 0 0 0 0 5H17v-2.5a2.5 2.5 0 0 0-2.5-2.5z" fill="#2EB67D" />
      <path d="M12 14.5a2.5 2.5 0 0 0 2.5 2.5 2.5 2.5 0 0 0 2.5-2.5V12h-2.5A2.5 2.5 0 0 0 12 14.5z" fill="#ECB22E" />
    </svg>
  ),
  salesforce: (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M10 5.5C10.8 4.3 12.2 3.5 13.8 3.5c1.9 0 3.5 1.1 4.3 2.7.7-.3 1.4-.4 2.2-.4C23 5.8 25 7.8 25 10.3s-2 4.5-4.7 4.5H6.2C3.9 14.8 2 13 2 10.7c0-2 1.5-3.7 3.4-4 .5-2.2 2.4-3.8 4.6-3.8z" fill="#00A1E0" transform="translate(-1 2) scale(0.92)" />
    </svg>
  ),
  postgres: (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M17.128 1.407c-1.37-.024-2.756.322-3.83.948-.673-.234-1.413-.38-2.198-.404-1.35-.042-2.598.32-3.616.95-.468-.132-.966-.2-1.484-.2C3.616 2.7 1.5 4.85 1.5 7.5c0 1.36.54 2.6 1.416 3.526-.017.165-.026.332-.026.5 0 4.06 3.022 7.474 7.11 7.474 1.16 0 2.257-.286 3.228-.8.41.12.843.184 1.29.184 2.69 0 4.982-2.236 4.982-5.08 0-.146-.006-.29-.018-.433C20.67 11.83 21.5 10.258 21.5 8.5c0-3.372-2.17-6.65-4.372-7.093z" fill="#336791" />
      <path d="M12 15c-1.5 0-3.5-1-3.5-4s1.5-5 3.5-5 3.5 2 3.5 5-2 4-3.5 4z" fill="white" opacity="0.3" />
    </svg>
  ),
  openai: (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071.005l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm17.075 3.97l-5.814-3.356 2.02-1.172a.072.072 0 0 1 .07-.005l4.83 2.786a4.494 4.494 0 0 1-.697 8.084V12.55a.78.78 0 0 0-.39-.684zm2.01-3.03l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.882 9.34V7.003a.073.073 0 0 1 .031-.062l4.83-2.787a4.5 4.5 0 0 1 6.681 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.167a4.5 4.5 0 0 1 7.375-3.46l-.142.08L9.18 5.55a.795.795 0 0 0-.393.681l-.003 6.74zm1.097-2.365l2.602-1.5 2.607 1.5v3.005l-2.602 1.5-2.607-1.5z" fill="#1a1a1a" />
    </svg>
  ),
  anthropic: (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M13.827 3L19.5 21h-3.383l-1.127-3.654H9.01L7.883 21H4.5L10.173 3h3.654zM12 7.38L9.89 14.308h4.22L12 7.38z" fill="#1a1a1a" />
    </svg>
  ),
  "google-calendar": (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="18" rx="2" fill="#4285F4" />
      <rect x="3" y="4" width="18" height="5" rx="1" fill="#1967D2" />
      <rect x="7" y="12" width="2" height="2" rx="0.5" fill="white" />
      <rect x="11" y="12" width="2" height="2" rx="0.5" fill="white" />
      <rect x="15" y="12" width="2" height="2" rx="0.5" fill="white" />
      <rect x="7" y="16" width="2" height="2" rx="0.5" fill="white" />
      <rect x="11" y="16" width="2" height="2" rx="0.5" fill="white" />
      <path d="M8 2v4M16 2v4" stroke="#1967D2" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  "google-drive": (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M8.267 3h7.466L22 14.5H8.267L2 3z" fill="#0F9D58" opacity="0.9" />
      <path d="M8.267 14.5L2 3l3.733 6.25L12 21l-3.733-6.5z" fill="#4285F4" opacity="0.9" />
      <path d="M22 14.5H8.267L12 21h6.267L22 14.5z" fill="#F4B400" opacity="0.9" />
    </svg>
  ),
  "google-mail": (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="4" width="20" height="16" rx="2" fill="#EA4335" />
      <path d="M2 6l10 7 10-7" stroke="white" strokeWidth="1.5" fill="none" />
      <rect x="2" y="4" width="20" height="16" rx="2" fill="none" stroke="#C5221F" strokeWidth="0.5" />
    </svg>
  ),
  "google-sheet": (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="4" y="2" width="16" height="20" rx="2" fill="#0F9D58" />
      <rect x="7" y="7" width="10" height="11" rx="0.5" fill="white" />
      <line x1="12" y1="7" x2="12" y2="18" stroke="#0F9D58" strokeWidth="0.75" />
      <line x1="7" y1="11" x2="17" y2="11" stroke="#0F9D58" strokeWidth="0.75" />
      <line x1="7" y1="14.5" x2="17" y2="14.5" stroke="#0F9D58" strokeWidth="0.75" />
    </svg>
  ),
  github: (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" fill="#1a1a1a" />
    </svg>
  ),
};

// Generic fallback icon (plug/connection)
const fallbackIcon = (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#a8a099" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

export function IntegrationIcon({ integrationId }: { integrationId: string }) {
  const icon = icons[integrationId] ?? fallbackIcon;
  return <span className="flex-shrink-0 flex items-center">{icon}</span>;
}
