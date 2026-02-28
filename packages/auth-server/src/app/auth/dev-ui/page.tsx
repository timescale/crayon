"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function DevUIAuthContent() {
  const searchParams = useSearchParams();
  const app = searchParams.get("app");

  if (!app) {
    return (
      <div style={{ fontFamily: "system-ui", maxWidth: 400, margin: "80px auto", textAlign: "center" }}>
        <h2>Invalid Request</h2>
        <p>Missing app parameter.</p>
      </div>
    );
  }

  // Prefix state with "devui:" so the GitHub callback can distinguish this flow
  const state = `devui:${app}`;
  const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID;
  const githubUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&state=${encodeURIComponent(state)}&scope=read:user,user:email`;

  return (
    <div style={{ fontFamily: "system-ui", maxWidth: 400, margin: "80px auto", textAlign: "center" }}>
      <h2>Open your crayon cloud workspace</h2>
      <p style={{ color: "#666", marginBottom: 24 }}>
        Verify your identity to open your workspace.
      </p>
      <a
        href={githubUrl}
        style={{
          display: "inline-block",
          padding: "12px 32px",
          background: "#24292e",
          color: "white",
          borderRadius: 8,
          textDecoration: "none",
          fontSize: 16,
        }}
      >
        Sign in with GitHub
      </a>
    </div>
  );
}

export default function DevUIAuthPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DevUIAuthContent />
    </Suspense>
  );
}
