import { networkInterfaces } from "node:os";

import type { NextConfig } from "next";

const normalizeBasePath = (value?: string) => {
  if (!value) return "";

  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";

  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
};

const resolveAllowedDevOrigins = () => {
  const hosts = new Set(["localhost", "127.0.0.1", "::1"]);

  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.internal) continue;

      if (entry.family === "IPv4" || entry.family === 4) {
        hosts.add(entry.address);
      }
    }
  }

  return [...hosts];
};

const basePath = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH);
const exportStatic = process.env.KIJU_EXPORT_STATIC === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: exportStatic ? "export" : "standalone",
  basePath,
  trailingSlash: exportStatic,
  // Erlaubt Tablets und andere Geräte im lokalen Netzwerk den Dev-Client sauber zu laden.
  allowedDevOrigins: resolveAllowedDevOrigins()
};

export default nextConfig;
