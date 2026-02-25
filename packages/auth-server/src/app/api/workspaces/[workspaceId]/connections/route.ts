import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getNango, listConnectionsByTags } from "@/lib/nango";
import { verifyWorkspaceMembership } from "@/lib/workspace";

type RouteContext = { params: Promise<{ workspaceId: string }> };

/**
 * GET /api/workspaces/{workspaceId}/connections
 * List all connections for a workspace across all integrations.
 */
export async function GET(req: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;

  const { workspaceId } = await params;

  const membership = await verifyWorkspaceMembership(auth.userId, workspaceId);
  if (!membership) {
    return NextResponse.json(
      { error: "Not a member of this workspace" },
      { status: 403 },
    );
  }

  try {
    const connections = await listConnectionsByTags({
      "workspace-id": workspaceId,
    });

    return NextResponse.json({ data: connections });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to list connections",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/workspaces/{workspaceId}/connections
 * Create a new connection via Nango Connect OAuth session.
 * Body: { integration_id: string }
 * Returns: { token: string }
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;

  const { workspaceId } = await params;

  const membership = await verifyWorkspaceMembership(auth.userId, workspaceId);
  if (!membership) {
    return NextResponse.json(
      { error: "Not a member of this workspace" },
      { status: 403 },
    );
  }

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
      tags: {
        "user-id": auth.userId,
        "workspace-id": workspaceId,
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
