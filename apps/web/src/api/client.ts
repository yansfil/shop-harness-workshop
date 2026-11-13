import { ApiErrorResponseSchema, buildPath, ENDPOINTS, type ErrorCode, type StockShortage } from "@grabmarket/contracts";

type Endpoints = typeof ENDPOINTS;
export type EndpointKey = keyof Endpoints;

type ZodInput<S> = S extends { _zod: { input: infer I } } ? I : never;
type ZodOutput<S> = S extends { _zod: { output: infer O } } ? O : never;

/** 호출에 필요한 입력. 계약 표에 params·query·body가 있는 엔드포인트만 해당 키를 요구한다. */
export type ApiInput<K extends EndpointKey> = (Endpoints[K] extends { params: infer S } ? { params: ZodInput<S> } : unknown) &
  (Endpoints[K] extends { query: infer S } ? { query: ZodInput<S> } : unknown) &
  (Endpoints[K] extends { body: infer S } ? { body: ZodInput<S> } : unknown);

export type ApiOutput<K extends EndpointKey> = Endpoints[K]["response"] extends null ? undefined : ZodOutput<Endpoints[K]["response"]>;

type CallArgs<K extends EndpointKey> = keyof ApiInput<K> extends never ? [] : [input: ApiInput<K>];

export type ApiErrorCode = ErrorCode | "NETWORK" | "INVALID_RESPONSE";

/** 화면이 보여 줄 수 있는 API 실패. message는 그대로 화면에 써도 된다. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly fieldErrors: Record<string, string[]> | undefined;
  readonly shortages: StockShortage[] | undefined;

  constructor(init: {
    code: ApiErrorCode;
    message: string;
    status: number;
    fieldErrors?: Record<string, string[]> | undefined;
    shortages?: StockShortage[] | undefined;
  }) {
    super(init.message);
    this.name = "ApiError";
    this.code = init.code;
    this.status = init.status;
    this.fieldErrors = init.fieldErrors;
    this.shortages = init.shortages;
  }
}

function toSearch(query: Record<string, unknown> | undefined): string {
  if (query === undefined) return "";
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(name, typeof value === "string" ? value : JSON.stringify(value));
  }
  const text = search.toString();
  return text === "" ? "" : `?${text}`;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/**
 * 계약 표(ENDPOINTS)대로 API를 부른다. 성공 응답은 계약의 response 스키마로 검사하고,
 * 실패는 모두 ApiError로 올린다(연결 실패는 NETWORK, 계약과 다른 응답은 INVALID_RESPONSE).
 */
export async function callApi<K extends EndpointKey>(key: K, ...args: CallArgs<K>): Promise<ApiOutput<K>> {
  const endpoint: Endpoints[EndpointKey] = ENDPOINTS[key];
  const input = (args[0] ?? {}) as { params?: unknown; query?: Record<string, unknown>; body?: unknown };

  const path = "params" in input ? buildPath(endpoint.path as string, input.params as never) : endpoint.path;
  const hasBody = "body" in input;

  let response: Response;
  try {
    response = await fetch(`${path}${toSearch(input.query)}`, {
      method: endpoint.method,
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(input.body) : undefined,
    });
  } catch {
    throw new ApiError({ code: "NETWORK", status: 0, message: "서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요." });
  }

  if (!response.ok) {
    const parsed = ApiErrorResponseSchema.safeParse(await readJson(response));
    if (!parsed.success) {
      throw new ApiError({ code: "INVALID_RESPONSE", status: response.status, message: "요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요." });
    }
    const { code, message, fieldErrors, shortages } = parsed.data.error;
    throw new ApiError({ code, message, status: response.status, fieldErrors, shortages });
  }

  if (endpoint.response === null) return undefined as ApiOutput<K>;
  const parsed = endpoint.response.safeParse(await readJson(response));
  if (!parsed.success) {
    throw new ApiError({ code: "INVALID_RESPONSE", status: response.status, message: "서버 응답을 읽지 못했어요. 잠시 뒤 다시 시도해 주세요." });
  }
  return parsed.data as ApiOutput<K>;
}

export function isApiError(error: unknown, code?: ApiErrorCode): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}
