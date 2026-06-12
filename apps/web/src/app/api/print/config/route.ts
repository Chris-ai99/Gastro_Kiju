import { proxyApiRequest } from "../../../../server/api-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return proxyApiRequest("/print/config");
}

export async function PUT(request: Request) {
  return proxyApiRequest("/print/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: await request.text()
  });
}
