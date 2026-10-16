import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, ".", "VITE_");
  return {
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: environment.VITE_API_TARGET || "http://127.0.0.1:3000",
        changeOrigin: false,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    clearMocks: true,
    globals: true,
  },
  };
});
