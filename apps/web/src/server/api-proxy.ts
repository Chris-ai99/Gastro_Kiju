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
  init?: RequestInit
) => {
  try {
    const response = await fetch(resolveInternalApiUrl(path), {
      cache: "no-store",
      ...init
    });
    const body = await response.text();

    return new Response(body, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") ??
          "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
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
