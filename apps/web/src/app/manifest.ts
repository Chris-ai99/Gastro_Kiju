import type { MetadataRoute } from "next";

import { appMetadata, resolveAppUrl, theme } from "@kiju/config";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: appMetadata.name,
    short_name: appMetadata.shortName,
    description: appMetadata.description,
    start_url: resolveAppUrl("/"),
    display: "standalone",
    background_color: theme.colors.ivory,
    theme_color: theme.colors.deepNavy,
    lang: "de-DE"
  };
}
