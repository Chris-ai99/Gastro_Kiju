"use client";

import type { PropsWithChildren } from "react";

import { DesignModeBridge } from "./design-mode-bridge";
import { InternalAccessGate } from "./internal-access-gate";
import { ServerConnectionBoundary } from "./server-connection-boundary";
import { DemoAppProvider } from "../lib/app-state";

export const InternalAppShell = ({ children }: PropsWithChildren) => (
  <InternalAccessGate>
    <DemoAppProvider>
      <DesignModeBridge />
      <ServerConnectionBoundary>{children}</ServerConnectionBoundary>
    </DemoAppProvider>
  </InternalAccessGate>
);
