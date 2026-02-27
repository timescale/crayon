"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function CliAuthContent() {
  const searchParams = useSearchParams();
  const cliCode = searchParams.get("cli_code");

  if (!cliCode) {
    return (
      <div style={{ fontFamily: "system-ui", maxWidth: 400, margin: "80px auto", textAlign: "center" }}>
        <h2>Invalid Request</h2>
        <p>Missing CLI authorization code.</p>
      </div>
    );
  }

  // Build GitHub OAuth URL with cli_code as state
  // No redirect_uri — GitHub uses the one registered in the OAuth app settings
  const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID;
  const githubUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&state=cli:${cliCode}&scope=read:user,user:email`;

  return (
    <div style={{ fontFamily: "system-ui", maxWidth: 400, margin: "80px auto", textAlign: "center" }}>
      <h2>crayon CLI Authorization</h2>
      <p style={{ color: "#666", marginBottom: 24 }}>
        Authorize your CLI to access crayon cloud services.
      </p>
      <p style={{ fontFamily: "monospace", fontSize: 24, letterSpacing: 4, margin: "24px 0" }}>
        {cliCode}
      </p>
      <p style={{ color: "#999", fontSize: 14, marginBottom: 24 }}>
        Verify this code matches what you see in your terminal.
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

export default function CliAuthPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CliAuthContent />
    </Suspense>
  );
}
