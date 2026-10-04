import { proxyApiRequest } from "../../../../../../server/api-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return proxyApiRequest("/print/bridge/jobs/result", {
    method: "POST",
    headers: {
      Authorization: request.headers.get("Authorization") ?? "",
      "Content-Type": "application/json"
    },
    body: await request.text()
  });
}
