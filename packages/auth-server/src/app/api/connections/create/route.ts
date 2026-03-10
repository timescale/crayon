import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";

/**
 * POST /api/connections/create
 * Programmatically create a Nango connection (for non-OAuth integrations like postgres).
 * Body: { integration_id, connection_id, credentials: { username, password }, connection_config?: { ... } }
 * Returns: { data: { connection_id } }
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json()) as {
    integration_id?: string;
    connection_id?: string;
    credentials?: { username: string; password: string };
    connection_config?: Record<string, string>;
  };

  if (!body.integration_id || !body.connection_id || !body.credentials) {
    return NextResponse.json(
      { error: "integration_id, connection_id, and credentials are required" },
      { status: 400 },
    );
  }

  try {
    const secretKey = process.env.NANGO_SECRET_KEY;
    if (!secretKey) {
      return NextResponse.json(
        { error: "NANGO_SECRET_KEY not configured" },
        { status: 500 },
      );
    }
    const serverUrl = process.env.NANGO_SERVER_URL || "https://api.nango.dev";

    const response = await fetch(`${serverUrl}/connections`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider_config_key: body.integration_id,
        connection_id: body.connection_id,
        credentials: {
          type: "BASIC",
          username: body.credentials.username,
          password: body.credentials.password,
        },
        connection_config: body.connection_config,
        end_user: { id: auth.userId },
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const msg = (error as { error?: { message?: string } }).error?.message;
      return NextResponse.json(
        { error: msg || `Failed to create connection: ${response.status}` },
        { status: response.status },
      );
    }

    return NextResponse.json({
      data: { connection_id: body.connection_id },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create connection" },
      { status: 500 },
    );
  }
}
