import { NextResponse } from "next/server";

import { retryQueuedPrintJob } from "../../../../../../server/print-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RetryContext = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function POST(_: Request, context: RetryContext) {
  const { jobId } = await context.params;
  const result = await retryQueuedPrintJob(jobId);

  if (!result.ok) {
    return NextResponse.json(result, { status: 404 });
  }

  return NextResponse.json(
    {
      ok: true,
      job: result.job
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
