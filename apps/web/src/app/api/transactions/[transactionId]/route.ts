import { proxyApiRequest } from "../../../../server/api-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ transactionId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { transactionId } = await context.params;
  return proxyApiRequest(
    `/transactions/${encodeURIComponent(transactionId)}`
  );
}
