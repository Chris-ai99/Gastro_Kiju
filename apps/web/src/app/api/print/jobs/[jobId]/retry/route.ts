import { proxyApiRequest } from "../../../../../../server/api-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RetryContext = {
  params: Promise<{ jobId: string }>;
};

export async function POST(_: Request, context: RetryContext) {
  const { jobId } = await context.params;
  return proxyApiRequest(`/print/jobs/${encodeURIComponent(jobId)}/retry`, {
    method: "POST"
  });
}
