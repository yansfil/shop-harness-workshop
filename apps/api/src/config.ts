// 환경 변수 계약은 여기 한 곳에만 있다. 값은 루트 .env(없으면 기본값)에서 온다.
// 다른 코드는 process.env를 직접 읽지 않고 loadConfig()를 쓴다. 키를 더하면 .env.example도 같이 고친다.
import path from "node:path";
import { z } from "zod";

export const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");

const PortSchema = z.coerce.number().int().min(1024).max(65535);

export const ENV_REGISTRY = {
  API_PORT: {
    requirement: "optional",
    schema: PortSchema,
    fallback: "3001",
    note: "API 서버 포트. 없으면 3001. 웹 개발 서버의 /api 프록시도 이 값을 따른다",
  },
  WEB_PORT: {
    requirement: "optional",
    schema: PortSchema,
    fallback: "5173",
    note: "웹 개발 서버 포트. 없으면 5173",
  },
  DATABASE_PATH: {
    requirement: "optional",
    schema: z.string().min(1),
    fallback: "data/grabmarket.sqlite",
    note: "SQLite 파일 경로(레포 루트 기준 상대 경로 가능). 없으면 data/grabmarket.sqlite",
  },
} as const;

export interface AppConfig {
  apiPort: number;
  webPort: number;
  databasePath: string;
}

export class ConfigError extends Error {
  constructor(problems: string[]) {
    super(`환경 변수가 올바르지 않습니다: ${problems.join(", ")}`);
    this.name = "ConfigError";
  }
}

/** 등록된 키를 모두 한 번에 검사한다. 문제가 있으면 키 이름과 문제 종류만 모아서 던진다(값은 싣지 않는다). */
export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const values: Record<string, unknown> = {};
  const problems: string[] = [];
  for (const [key, entry] of Object.entries(ENV_REGISTRY)) {
    const raw = env[key] === undefined || env[key] === "" ? entry.fallback : env[key];
    const parsed = entry.schema.safeParse(raw);
    if (parsed.success) values[key] = parsed.data;
    else problems.push(`${key} 형식 오류`);
  }
  if (problems.length > 0) throw new ConfigError(problems);
  return {
    apiPort: values.API_PORT as number,
    webPort: values.WEB_PORT as number,
    databasePath: path.resolve(REPO_ROOT, values.DATABASE_PATH as string),
  };
}
