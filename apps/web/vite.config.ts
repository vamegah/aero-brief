import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    // Local dev: forward API calls to `wrangler dev` for apps/api.
    proxy: { "/api": "http://localhost:8787" },
  },
  test: {
    name: "web",
    environment: "jsdom",
    include: ["test/**/*.test.{ts,tsx}"],
    setupFiles: ["./test/setup.ts"],
    // Vitest blanks every CSS id (even `?raw`) unless it matches css.include.
    // palette-sync.test.ts needs the real text of tokens.css.
    css: { include: [/styles\/tokens\.css/] },
  },
});
