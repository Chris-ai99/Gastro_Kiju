import { proxyApiRequest } from "../../../../server/api-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return proxyApiRequest("/print/jobs", undefined, request);
}

export async function POST(request: Request) {
  return proxyApiRequest("/print/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await request.text()
  }, request);
}
