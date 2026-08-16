import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    { version: process.env.NEXT_PUBLIC_BUILD_ID },
    { headers: { "Cache-Control": "no-store" } }
  );
}
