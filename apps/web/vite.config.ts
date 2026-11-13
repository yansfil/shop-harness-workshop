import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { loadConfig } from "../api/src/config.ts";

const config = loadConfig();

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: config.webPort,
    strictPort: true,
    proxy: { "/api": `http://127.0.0.1:${config.apiPort}` },
  },
  preview: { host: "127.0.0.1", port: config.webPort, strictPort: true },
  test: {
    name: "web",
    environment: "happy-dom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test-setup.ts"],
  },
});
