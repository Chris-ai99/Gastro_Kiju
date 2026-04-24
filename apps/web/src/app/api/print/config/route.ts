import { NextRequest, NextResponse } from "next/server";

import { getPrintOverview, updatePrinterConfig } from "../../../../server/print-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const overview = await getPrintOverview();

  return NextResponse.json(
    {
      ok: true,
      printer: overview.printer
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      enabled?: boolean;
      host?: string;
      port?: number;
    };

    const printer = await updatePrinterConfig({
      enabled: Boolean(body.enabled),
      host: typeof body.host === "string" ? body.host : "",
      port: typeof body.port === "number" ? body.port : 9100
    });

    return NextResponse.json(
      {
        ok: true,
        printer
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
        message: "Druckerkonfiguration konnte nicht gespeichert werden."
      },
      {
        status: 400
      }
    );
  }
}
