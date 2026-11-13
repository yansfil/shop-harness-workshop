// 예전 운영 기능 API 부르기. 계약 표(ENDPOINTS)에 없는 경로라 응답을 검사하지 않고 그대로 쓴다.
import { ApiError, type ApiErrorCode } from "../api/client.ts";

function toSearch(query?: any): string {
  if (!query) return "";
  const search = new URLSearchParams();
  for (const name of Object.keys(query)) {
    const value = query[name];
    if (value === undefined || value === null || value === "") continue;
    search.set(name, String(value));
  }
  const text = search.toString();
  return text === "" ? "" : "?" + text;
}

async function send(method: string, path: string, body?: any, query?: any): Promise<any> {
  let response: Response;
  try {
    response = await fetch(path + toSearch(query), {
      method: method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError({ code: "NETWORK", status: 0, message: "서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요." });
  }
  let data: any;
  try {
    data = await response.json();
  } catch {
    data = undefined;
  }
  if (!response.ok) {
    const error = data && data.error ? data.error : null;
    throw new ApiError({
      code: (error ? error.code : "INVALID_RESPONSE") as ApiErrorCode,
      status: response.status,
      message: error && error.message ? error.message : "요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
      fieldErrors: error ? error.fieldErrors : undefined,
      shortages: error ? error.shortages : undefined,
    });
  }
  return data;
}

export function legacyGet(path: string, query?: any): Promise<any> {
  return send("GET", path, undefined, query);
}

export function legacyPost(path: string, body?: any): Promise<any> {
  return send("POST", path, body === undefined ? {} : body);
}

export function legacyPut(path: string, body?: any): Promise<any> {
  return send("PUT", path, body === undefined ? {} : body);
}

/** CSV 내려받기 주소 */
export function csvHref(path: string, query?: any): string {
  return path + toSearch(query);
}

/** 오류에서 화면에 보일 글 한 줄 */
export function errorText(error: any): string {
  if (error instanceof ApiError) return error.message;
  return "처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.";
}

/** 칸별 오류 (fieldErrors) */
export function fieldError(error: any, name: string): string | null {
  if (!(error instanceof ApiError) || !error.fieldErrors) return null;
  const list = error.fieldErrors[name];
  return list && list.length > 0 ? (list[0] ?? null) : null;
}
