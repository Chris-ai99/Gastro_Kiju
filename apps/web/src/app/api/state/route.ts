import { proxyApiRequest } from "../../../server/api-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return proxyApiRequest("/state");
}

export async function PUT() {
  return Response.json(
    {
      success: false,
      message:
        "Direktes Ersetzen des Zustands ist deaktiviert. Verwende bestätigte Transaktionen."
    },
    {
      status: 405,
      headers: {
        Allow: "GET",
        "Cache-Control": "no-store"
      }
    }
  );
}
