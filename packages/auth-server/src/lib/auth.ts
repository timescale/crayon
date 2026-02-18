import { type NextRequest, NextResponse } from "next/server";
import { getReadyPool } from "./db";
import crypto from "node:crypto";

/**
 * Generate a cryptographically random hex string.
 */
export function randomHex(bytes: number): string {
  return crypto.randomBytes(bytes).toString("hex");
}

/**
 * Authenticate a request by Bearer token.
 * Returns the user_id if valid, or a NextResponse error.
 */
export async function authenticateRequest(
  req: NextRequest,
): Promise<{ userId: string } | NextResponse> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization header" },
      { status: 401 },
    );
  }

  const token = authHeader.slice(7);
  const db = await getReadyPool();

  const result = await db.query(
    `SELECT user_id FROM cli_auth_sessions
     WHERE session_token = $1 AND status = 'approved'`,
    [token],
  );

  if (result.rows.length === 0) {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 },
    );
  }

  return { userId: result.rows[0].user_id as string };
}
