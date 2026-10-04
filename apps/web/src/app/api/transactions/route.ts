import { proxyApiRequest } from "../../../server/api-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return proxyApiRequest("/transactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-KiJu-Forwarded-By": "web"
    },
    body: await request.text()
  });
}
