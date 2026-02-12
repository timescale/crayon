import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getNango } from "@/lib/nango";

/**
 * GET /api/integrations/{id}/connections
 * List Nango connections for an integration. Requires Bearer token.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;

  const { id: integrationId } = await params;

  try {
    const nango = getNango();
    const result = await nango.listConnections();
    // Filter by integration AND by end_user to enforce tenant isolation
    const filtered = (result.connections ?? []).filter(
      (c: { provider_config_key: string; end_user?: { id: string } | null }) =>
        c.provider_config_key === integrationId &&
        c.end_user?.id === auth.userId,
    );

    return NextResponse.json({ data: filtered });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list connections" },
      { status: 500 },
    );
  }
}
