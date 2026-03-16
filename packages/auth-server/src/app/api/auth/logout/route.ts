import { type NextRequest, NextResponse } from "next/server";
import { WEB_SESSION_COOKIE } from "@/lib/auth";
import { getPool } from "@/lib/db";

/**
 * POST /api/auth/logout
 * Deletes the web session and clears the cookie.
 */
export async function POST(req: NextRequest) {
  const token = req.cookies.get(WEB_SESSION_COOKIE)?.value;

  if (token) {
    try {
      const db = await getPool();
      await db.query(
        `DELETE FROM web_sessions WHERE session_token = $1`,
        [token],
      );
    } catch {
      // Best-effort cleanup
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(WEB_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
