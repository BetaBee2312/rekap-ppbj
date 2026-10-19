import { NextResponse } from "next/server";
import { syncGoogleSheetToMySql } from "../../../../lib/ppbj-sync";

export async function POST(request: Request) {
  let force = false;
  let allowShrink = false;
  try {
    const body = await request.json();
    force = body?.force === true;
    allowShrink = body?.allowShrink === true;
  } catch {
    // Empty JSON body is accepted for the automatic page-entry sync.
  }

  try {
    const result = await syncGoogleSheetToMySql(force, allowShrink);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sinkronisasi Google Sheets gagal.";
    console.error("PPBJ Sheets → MySQL sync failed:", error);
    const shrinkWarning = message.startsWith("SOURCE_SHRINK:");
    return NextResponse.json({ code: shrinkWarning ? "SOURCE_SHRINK" : "SYNC_FAILED", error: shrinkWarning ? message.replace(/^SOURCE_SHRINK:\s*/, "") : message }, {
      status: shrinkWarning ? 409 : 502,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }
}
