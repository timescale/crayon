import { type NextRequest, NextResponse } from "next/server";
import { getCrayon } from "~/lib/crayon";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params;
    const testMode = request.nextUrl.searchParams.get("test_mode") !== "false";
    const crayon = await getCrayon();
    const result = await crayon.triggerWorkflow(name, {}, { testMode });
    return NextResponse.json({ status: "completed", result, test_mode: testMode });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params;
    const crayon = await getCrayon();
    const body = (await request.json()) as { input?: unknown; test_mode?: boolean };
    const input = body.input ?? body;
    const testMode = body.test_mode ?? false;
    const result = await crayon.triggerWorkflow(name, input, { testMode });
    return NextResponse.json({ status: "completed", result, test_mode: testMode });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
