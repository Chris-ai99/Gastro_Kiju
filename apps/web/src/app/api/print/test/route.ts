import { proxyApiRequest } from "../../../../server/api-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return proxyApiRequest("/print/test", { method: "POST" });
}
