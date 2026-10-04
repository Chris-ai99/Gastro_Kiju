"use client";

import type { PropsWithChildren } from "react";

import { DesignModeBridge } from "./design-mode-bridge";
import { TransmissionStatusBanner } from "./transmission-status-banner";
import { DemoAppProvider } from "../lib/app-state";

export const InternalAppShell = ({ children }: PropsWithChildren) => (
  <DemoAppProvider>
    <DesignModeBridge />
    <TransmissionStatusBanner />
    {children}
  </DemoAppProvider>
);
