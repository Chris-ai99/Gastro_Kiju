import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@kiju/config": resolve(__dirname, "../config/src/index.ts")
    }
  },
  test: {
    environment: "node"
  }
});
