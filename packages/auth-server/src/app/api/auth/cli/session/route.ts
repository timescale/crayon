import { NextResponse } from "next/server";
import { getReadyPool } from "@/lib/db";
import { randomHex } from "@/lib/auth";

/**
 * POST /api/auth/cli/session
 * Create a new CLI auth session. Returns {code, secret} for the CLI to poll.
 */
export async function POST() {
  const db = await getReadyPool();

  const code = randomHex(4); // 8-char hex
  const secret = randomHex(16); // 32-char hex
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  await db.query(
    `INSERT INTO cli_auth_sessions (code, secret, expires_at)
     VALUES ($1, $2, $3)`,
    [code, secret, expiresAt],
  );

  return NextResponse.json({
    data: { code, secret },
  });
}
