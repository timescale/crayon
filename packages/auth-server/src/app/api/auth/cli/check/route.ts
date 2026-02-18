import { type NextRequest, NextResponse } from "next/server";
import { getReadyPool } from "@/lib/db";

/**
 * GET /api/auth/cli/check?code=X&secret=Y
 * Poll for session approval status. Returns {status, token?}.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const secret = searchParams.get("secret");

  if (!code || !secret) {
    return NextResponse.json(
      { error: "code and secret are required" },
      { status: 400 },
    );
  }

  const db = await getReadyPool();

  const result = await db.query(
    `SELECT status, session_token, secret, expires_at
     FROM cli_auth_sessions
     WHERE code = $1`,
    [code],
  );

  if (result.rows.length === 0) {
    return NextResponse.json(
      { data: { status: "expired" } },
    );
  }

  const session = result.rows[0];

  // Validate secret
  if (session.secret !== secret) {
    return NextResponse.json(
      { error: "Invalid secret" },
      { status: 403 },
    );
  }

  // Check expiry
  if (new Date(session.expires_at) < new Date()) {
    await db.query(
      `UPDATE cli_auth_sessions SET status = 'expired' WHERE code = $1`,
      [code],
    );
    return NextResponse.json({ data: { status: "expired" } });
  }

  if (session.status === "approved" && session.session_token) {
    return NextResponse.json({
      data: {
        status: "approved",
        token: session.session_token,
      },
    });
  }

  return NextResponse.json({ data: { status: "pending" } });
}
