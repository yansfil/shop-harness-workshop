import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ENV_REGISTRY, REPO_ROOT } from "../apps/api/src/config.ts";

describe("환경 변수 계약", () => {
  it(".env.example의 키와 ENV_REGISTRY의 키가 같다", () => {
    const example = readFileSync(path.join(REPO_ROOT, ".env.example"), "utf8");
    const exampleKeys = [...example.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]).sort();
    expect(exampleKeys).toEqual(Object.keys(ENV_REGISTRY).sort());
  });

  it("apps·packages 코드는 config.ts 밖에서 process.env를 읽지 않는다", () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === "dist") continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts") && readFileSync(full, "utf8").includes("process.env")) {
          offenders.push(path.relative(REPO_ROOT, full));
        }
      }
    };
    walk(path.join(REPO_ROOT, "apps"));
    walk(path.join(REPO_ROOT, "packages"));
    expect(offenders).toEqual([path.join("apps", "api", "src", "config.ts")]);
  });
});
