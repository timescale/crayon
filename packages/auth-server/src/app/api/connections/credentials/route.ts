import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getNango } from "@/lib/nango";
import { verifyWorkspaceMembership } from "@/lib/workspace";

/**
 * GET /api/connections/credentials?integration_id=X&connection_id=Y
 * Fetch actual credentials from Nango for a connection.
 * Authorization is based on workspace membership via connection tags.
 * Returns { token, connectionConfig, raw }.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;

  const integrationId = req.nextUrl.searchParams.get("integration_id");
  const connectionId = req.nextUrl.searchParams.get("connection_id");

  if (!integrationId) {
    return NextResponse.json(
      { error: "integration_id query parameter is required" },
      { status: 400 },
    );
  }

  if (!connectionId) {
    return NextResponse.json(
      { error: "connection_id query parameter is required" },
      { status: 400 },
    );
  }

  try {
    const nango = getNango();
    const connection = await nango.getConnection(integrationId, connectionId);

    // Extract workspace-id from connection tags and verify membership
    const connAny = connection as unknown as {
      tags?: Record<string, string>;
    };
    const workspaceId = connAny.tags?.["workspace-id"];

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 },
      );
    }

    const membership = await verifyWorkspaceMembership(
      auth.userId,
      workspaceId,
    );
    if (!membership) {
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
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to fetch credentials",
      },
      { status: 500 },
    );
  }
}
