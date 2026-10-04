import { proxyApiStream } from "../../../server/api-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return proxyApiStream("/events", request);
}
