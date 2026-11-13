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
          exclude: ["tools/launcher/**", "**/node_modules/**"],
        },
      },
      {
        // 런처 테스트는 자식 프로세스와 fixture를 쓴다. Windows 러너에서 한 테스트가 5초를 넘기므로 시간 예산을 따로 둔다.
        test: {
          name: "launcher",
          environment: "node",
          include: ["tools/launcher/src/**/*.test.ts"],
          testTimeout: 30_000,
        },
      },
      "apps/web",
    ],
  },
});
