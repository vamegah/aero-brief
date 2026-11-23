import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          include: [
            "src/**/*.test.ts",
            "tests/**/*.test.ts",
            "packages/*/test/**/*.test.ts",
            "apps/*/test/**/*.test.ts",
          ],
          exclude: ["**/node_modules/**", "apps/web/**"],
          environment: "node",
        },
      },
      // jsdom project; configured in apps/web/vite.config.ts
      "apps/web",
    ],
  },
});
