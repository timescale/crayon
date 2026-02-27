import { type NextRequest, NextResponse } from "next/server";
import { getCrayon } from "~/lib/crayon";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params;
    const crayon = await getCrayon();
    const result = await crayon.triggerWorkflow(name, {});
    return NextResponse.json({ status: "completed", result });
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
    const body: unknown = await request.json();
    const result = await crayon.triggerWorkflow(name, body);
    return NextResponse.json({ status: "completed", result });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
