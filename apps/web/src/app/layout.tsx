import type { Metadata } from "next";

import { appMetadata } from "@kiju/config";

import { ThemeProvider } from "../components/theme-provider";
import { ThemeToggle } from "../components/theme-toggle";
import { DemoAppProvider } from "../lib/app-state";
import "./globals.css";

export const metadata: Metadata = {
  title: appMetadata.name,
  description: appMetadata.description
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body>
        <ThemeProvider>
          <DemoAppProvider>
            <ThemeToggle />
            {children}
          </DemoAppProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
