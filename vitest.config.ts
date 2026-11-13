import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: [
            "packages/*/src/**/*.test.ts",
            "apps/api/src/**/*.test.ts",
            "tools/*/src/**/*.test.ts",
            "tests/**/*.test.ts",
          ],
        },
      },
      "apps/web",
    ],
  },
});
