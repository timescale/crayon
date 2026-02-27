import { type NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { randomHex } from "@/lib/auth";
import { signDevUIToken } from "@/lib/jwt";

function errorPage(message: string): string {
  return `<html><body style="font-family: system-ui; max-width: 400px; margin: 80px auto; text-align: center;">
    <h2>Authentication Failed</h2>
    <p>${message}</p>
  </body></html>`;
}

/**
 * GET /api/auth/github/callback?code=X&state=STATE
 * GitHub OAuth callback. Handles both CLI auth and dev-ui auth flows.
 *
 * CLI flow:  state = <cli_code>       → approves CLI session
 * Dev UI:   state = devui:<fly_app>   → signs JWT, redirects to machine
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const githubCode = searchParams.get("code");
  const state = searchParams.get("state");

  if (!githubCode || !state) {
    return NextResponse.json(
      { error: "Missing code or state parameter" },
      { status: 400 },
    );
  }

  // Exchange GitHub code for access token
  const tokenResponse = await fetch(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code: githubCode,
      }),
    },
  );

  const tokenData = (await tokenResponse.json()) as {
    access_token?: string;
    error?: string;
  };

  if (!tokenData.access_token) {
    return NextResponse.json(
      { error: `GitHub OAuth failed: ${tokenData.error ?? "unknown error"}` },
      { status: 400 },
    );
  }

  // Fetch GitHub user info
  const userResponse = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  const githubUser = (await userResponse.json()) as {
    id: number;
    login: string;
    email: string | null;
  };

  const db = await getPool();

  // Upsert user
  const userResult = await db.query(
    `INSERT INTO users (github_id, github_login, email)
     VALUES ($1, $2, $3)
     ON CONFLICT (github_id) DO UPDATE
       SET github_login = EXCLUDED.github_login,
           email = COALESCE(EXCLUDED.email, users.email)
     RETURNING id`,
    [String(githubUser.id), githubUser.login, githubUser.email],
  );

  const userId = userResult.rows[0].id as string;

  // ── Dev UI flow ──────────────────────────────────────────────────
  if (state.startsWith("devui:")) {
    const flyAppName = state.slice("devui:".length);

    // Validate fly app name format
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(flyAppName)) {
      return new NextResponse(errorPage("Invalid app name."), {
        status: 400,
        headers: { "Content-Type": "text/html" },
      });
    }

    // Check membership
    const memberResult = await db.query(
      `SELECT dmm.role
       FROM dev_machine_members dmm
       JOIN dev_machines dm ON dm.id = dmm.machine_id
       WHERE dm.fly_app_name = $1 AND dmm.user_id = $2`,
      [flyAppName, userId],
    );

    if (memberResult.rows.length === 0) {
      return new NextResponse(
        errorPage(
          "Access denied. You are not a member of this dev environment.",
        ),
        { status: 403, headers: { "Content-Type": "text/html" } },
      );
    }

    // Sign JWT with Ed25519 private key
    const jwt = await signDevUIToken({
      sub: userId,
      app: flyAppName,
      login: githubUser.login,
    });

    // Redirect to the dev-server's callback endpoint
    const callbackUrl = `https://${flyAppName}.fly.dev/dev/__auth/callback?token=${encodeURIComponent(jwt)}`;
    return NextResponse.redirect(callbackUrl);
  }

  // ── CLI flow (existing) ──────────────────────────────────────────
  const cliCode = state;
  const sessionToken = randomHex(32); // 64-char hex

  const updateResult = await db.query(
    `UPDATE cli_auth_sessions
     SET status = 'approved', user_id = $1, session_token = $2
     WHERE code = $3 AND status = 'pending' AND expires_at > NOW()
     RETURNING id`,
    [userId, sessionToken, cliCode],
  );

  if (updateResult.rows.length === 0) {
    return new NextResponse(
      `<html><body>
        <h2>Session expired or already approved</h2>
        <p>Please try running the command again.</p>
      </body></html>`,
      { status: 400, headers: { "Content-Type": "text/html" } },
    );
  }

  // Success — show confirmation page
  return new NextResponse(
    `<html><body style="font-family: system-ui; max-width: 400px; margin: 80px auto; text-align: center;">
      <h2>Authorized!</h2>
      <p>You can close this window and return to your terminal.</p>
      <p style="color: #666; font-size: 14px;">Signed in as <strong>${githubUser.login}</strong></p>
    </body></html>`,
    { headers: { "Content-Type": "text/html" } },
  );
}
