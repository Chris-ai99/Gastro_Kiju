import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  deploymentConfig,
  isSelfOrderPublicHost,
  normalizeSelfOrderPublicBaseUrl
} from "@kiju/config";

const selfOrderPublicBaseUrl = normalizeSelfOrderPublicBaseUrl(
  process.env["NEXT_PUBLIC_SELF_ORDER_PUBLIC_BASE_URL"]
);

const stripBasePath = (pathname: string) => {
  const { basePath } = deploymentConfig;
  if (!basePath) return pathname;
  if (pathname === basePath) return "/";
  return pathname.startsWith(`${basePath}/`) ? pathname.slice(basePath.length) || "/" : pathname;
};

const isAllowedSelfOrderPath = (pathname: string) =>
  pathname === "/manifest.webmanifest" ||
  pathname === "/favicon.ico" ||
  pathname.startsWith("/_next/") ||
  pathname.startsWith("/bestellen/") ||
  pathname.startsWith("/api/self-order/");

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? request.nextUrl.host;
  if (!isSelfOrderPublicHost(host, selfOrderPublicBaseUrl)) {
    return NextResponse.next();
  }

  const pathname = stripBasePath(request.nextUrl.pathname);
  if (isAllowedSelfOrderPath(pathname)) {
    const response = NextResponse.next();
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }

  return new NextResponse(
    "Diese öffentliche Adresse ist nur für die QR-Selbstbestellung freigegeben.",
    {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Robots-Tag": "noindex, nofollow"
      }
    }
  );
}

export const config = {
  matcher: ["/:path*"]
};
