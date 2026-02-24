import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getNango } from "@/lib/nango";
import { verifyWorkspaceMembership } from "@/lib/workspace";

/**
 * POST /api/nango/connect-session
 * Create a Nango Connect session for OAuth setup, scoped to a workspace.
 * Body: { integration_id: string, workspace_id: string }
 * Returns: { token: string }
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json()) as {
    integration_id?: string;
    workspace_id?: string;
  };

  if (!body.integration_id) {
    return NextResponse.json(
      { error: "integration_id is required" },
      { status: 400 },
    );
  }

  if (!body.workspace_id) {
    return NextResponse.json(
      { error: "workspace_id is required" },
      { status: 400 },
    );
  }

  const membership = await verifyWorkspaceMembership(
    auth.userId,
    body.workspace_id,
  );
  if (!membership) {
    return NextResponse.json(
      { error: "Not a member of this workspace" },
      { status: 403 },
    );
  }

  try {
    const nango = getNango();
    const session = await nango.createConnectSession({
      tags: {
        "user-id": auth.userId,
        "workspace-id": body.workspace_id,
      },
      allowed_integrations: [body.integration_id],
    });

    return NextResponse.json({
      data: { token: session.data.token },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to create connect session",
      },
      { status: 500 },
    );
  }
}
