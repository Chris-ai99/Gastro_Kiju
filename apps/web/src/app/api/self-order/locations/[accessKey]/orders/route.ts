import { proxyApiRequest } from "../../../../../../server/api-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ accessKey: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { accessKey } = await context.params;
  return proxyApiRequest(
    `/public/self-order/locations/${encodeURIComponent(accessKey)}/orders`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For":
          request.headers.get("X-Forwarded-For") ??
          request.headers.get("X-Real-IP") ??
          ""
      },
      body: await request.text()
    }
  );
}
