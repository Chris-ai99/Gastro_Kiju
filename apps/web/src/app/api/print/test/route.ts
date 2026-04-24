import { NextResponse } from "next/server";

import { createQueuedTestPrintJob } from "../../../../server/print-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const result = await createQueuedTestPrintJob();

  return NextResponse.json(
    {
      ok: true,
      printer: result.printer,
      job: result.job
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
