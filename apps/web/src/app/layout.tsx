import type { Metadata } from "next";

import { appMetadata } from "@kiju/config";

import { DesignModeBridge } from "../components/design-mode-bridge";
import { ThemeProvider } from "../components/theme-provider";
import { ThemeToggle } from "../components/theme-toggle";
import { DemoAppProvider } from "../lib/app-state";
import "./globals.css";
import "./design-modern.css";

export const metadata: Metadata = {
  title: appMetadata.name,
  description: appMetadata.description
};

const themeInitScript = `
(() => {
  try {
    const storedTheme = window.localStorage.getItem("kiju-theme-mode-v1");
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const theme = storedTheme === "light" || storedTheme === "dark" ? storedTheme : systemTheme;
    document.documentElement.dataset.theme = theme;

    const storedState = window.localStorage.getItem("kiju-app-state-v2");
    const parsedState = storedState ? JSON.parse(storedState) : null;
    const designMode = parsedState?.designMode === "classic" ? "classic" : "modern";
    document.documentElement.dataset.design = designMode;
  } catch {
    document.documentElement.dataset.theme = "light";
    document.documentElement.dataset.design = "modern";
  }
})();
`;

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeProvider>
          <DemoAppProvider>
            <DesignModeBridge />
            <ThemeToggle />
            {children}
          </DemoAppProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
