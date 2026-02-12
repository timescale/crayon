import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getNango } from "@/lib/nango";

/**
 * GET /api/credentials/{integrationId}?connection_id=X
 * Core proxy: fetch actual credentials from Nango for a connection.
 * Returns { token, connectionConfig, raw }.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ integrationId: string }> },
) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;

  const { integrationId } = await params;
  const connectionId = new URL(req.url).searchParams.get("connection_id");

  if (!connectionId) {
    return NextResponse.json(
      { error: "connection_id query parameter is required" },
      { status: 400 },
    );
  }

  try {
    const nango = getNango();
    const connection = await nango.getConnection(integrationId, connectionId);

    // Verify the connection belongs to the requesting user
    const connAny = connection as unknown as { end_user?: { id: string } | null };
    const endUserId = connAny.end_user?.id;
    if (endUserId && endUserId !== auth.userId) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 },
      );
    }

    const creds = (connection.credentials ?? {}) as Record<string, unknown>;
    const token =
      (creds.access_token ??
      creds.api_key ??
      creds.apiKey ??
      creds.token ??
      "") as string;

    return NextResponse.json({
      data: {
        token,
        connectionConfig: connection.connection_config ?? {},
        raw: creds,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch credentials" },
      { status: 500 },
    );
  }
}
