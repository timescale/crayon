import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { listConnectionsByTags } from "@/lib/nango";
import { verifyWorkspaceMembership } from "@/lib/workspace";

/**
 * GET /api/connections?workspace_id=X
 * List all Nango connections for a workspace. Requires Bearer token.
 * Returns connections across all integrations for any workspace member.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;

  const workspaceId = req.nextUrl.searchParams.get("workspace_id");
  if (!workspaceId) {
    return NextResponse.json(
      { error: "workspace_id query parameter is required" },
      { status: 400 },
    );
  }

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
          err instanceof Error
            ? err.message
            : "Failed to list connections",
      },
      { status: 500 },
    );
  }
}
