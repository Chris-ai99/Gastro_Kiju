"use client";

import { useEffect } from "react";

import { useDemoApp } from "../lib/app-state";

export const DesignModeBridge = () => {
  const { hydrated, state } = useDemoApp();

  useEffect(() => {
    if (!hydrated) return;

    document.documentElement.dataset["design"] =
      state.designMode === "classic" ? "classic" : "modern";
  }, [hydrated, state.designMode]);

  return null;
};
