import { NextRequest, NextResponse } from "next/server";

import type { CreatePrintJobRequest } from "../../../../lib/print-contract";
import { createQueuedPrintJob, getPrintOverview } from "../../../../server/print-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const overview = await getPrintOverview();

  return NextResponse.json(
    {
      ok: true,
      printer: overview.printer,
      jobs: overview.jobs
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreatePrintJobRequest;

    if (!body || (body.type !== "receipt" && body.type !== "reprint" && body.type !== "kitchen-ticket")) {
      return NextResponse.json(
        {
          ok: false,
          message: "Ungültiger Druckjob."
        },
        {
          status: 400
        }
      );
    }

    if (body.type === "kitchen-ticket") {
      if (body.batch.course === "drinks") {
        return NextResponse.json(
          {
            ok: false,
            message: "Getränke werden in dieser Phase nicht als Küchenbon gedruckt."
          },
          {
            status: 400
          }
        );
      }
    } else if (!body.receipt) {
      return NextResponse.json(
        {
          ok: false,
          message: "Für Rechnungen fehlt die Bon-Vorlage."
        },
        {
          status: 400
        }
      );
    }

    const result = await createQueuedPrintJob(body);

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
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "Druckjob konnte nicht erstellt werden."
      },
      {
        status: 400
      }
    );
  }
}
