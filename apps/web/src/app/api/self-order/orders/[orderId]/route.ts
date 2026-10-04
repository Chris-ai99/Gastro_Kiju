import { proxyApiRequest } from "../../../../../server/api-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ orderId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { orderId } = await context.params;
  return proxyApiRequest(
    `/public/self-order/orders/${encodeURIComponent(orderId)}`,
    {
      headers: {
        Authorization: request.headers.get("Authorization") ?? "",
        "X-Forwarded-For":
          request.headers.get("X-Forwarded-For") ??
          request.headers.get("X-Real-IP") ??
          ""
      }
    }
  );
}
