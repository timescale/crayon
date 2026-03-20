import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getNango } from "@/lib/nango";

/**
 * POST /api/nango/connect-session
 * Create a Nango Connect session for OAuth setup.
 * Body: { integration_id: string }
 * Returns: { token: string }
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json()) as { integration_id?: string };

  if (!body.integration_id) {
    return NextResponse.json(
      { error: "integration_id is required" },
      { status: 400 },
    );
  }

  try {
    const nango = getNango();
    const session = await nango.createConnectSession({
      end_user: { id: auth.userId },
      allowed_integrations: [body.integration_id],
      ...(body.integration_id === "slack" && {
        integrations_config_defaults: {
          slack: {
            user_scopes: "search:read",
          },
        },
      }),
    });

    return NextResponse.json({
      data: { token: session.data.token },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create connect session" },
      { status: 500 },
    );
  }
}
