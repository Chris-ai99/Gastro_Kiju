const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, "");

export const resolveInternalApiUrl = (path: string) => {
  const configured =
    process.env["KIJU_API_INTERNAL_URL"]?.trim() ||
    process.env["NEXT_PUBLIC_KIJU_API_BASE_URL"]?.trim() ||
    "http://127.0.0.1:4000/api";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizeBaseUrl(configured)}${normalizedPath}`;
};

export const proxyApiRequest = async (
  path: string,
  init?: RequestInit,
  incomingRequest?: Request
) => {
  try {
    const headers = new Headers(init?.headers);
    if (incomingRequest) {
      for (const name of ["cookie", "authorization", "x-forwarded-for", "x-forwarded-proto"]) {
        const value = incomingRequest.headers.get(name);
        if (value && !headers.has(name)) headers.set(name, value);
      }
    }
    const response = await fetch(resolveInternalApiUrl(path), {
      cache: "no-store",
      ...init,
      headers
    });
    const body = await response.text();
    const responseHeaders = new Headers({
      "Content-Type":
        response.headers.get("Content-Type") ??
        "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) responseHeaders.set("Set-Cookie", setCookie);
    const retryAfter = response.headers.get("retry-after");
    if (retryAfter) responseHeaders.set("Retry-After", retryAfter);

    return new Response(body, {
      status: response.status,
      headers: responseHeaders
    });
  } catch {
    return Response.json(
      {
        success: false,
        message: "Die zentrale Gastro-API ist nicht erreichbar."
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }
};

export const proxyApiStream = async (path: string, incomingRequest: Request) => {
  try {
    const headers = new Headers();
    for (const name of ["cookie", "authorization", "x-forwarded-for", "x-forwarded-proto"]) {
      const value = incomingRequest.headers.get(name);
      if (value) headers.set(name, value);
    }
    const response = await fetch(resolveInternalApiUrl(path), {
      cache: "no-store",
      headers,
      signal: incomingRequest.signal
    });
    if (!response.ok || !response.body) {
      return new Response(await response.text(), {
        status: response.status,
        headers: {
          "Content-Type": response.headers.get("Content-Type") ?? "application/json",
          "Cache-Control": "no-store"
        }
      });
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      }
    });
  } catch {
    return Response.json(
      { success: false, message: "Die Live-Verbindung zur Gastro-API ist nicht erreichbar." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
};
