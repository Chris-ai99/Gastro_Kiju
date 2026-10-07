import { proxyApiRequest } from "../../../../../server/api-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return proxyApiRequest(
    "/print/config/reset",
    { method: "POST" },
    request
  );
}
