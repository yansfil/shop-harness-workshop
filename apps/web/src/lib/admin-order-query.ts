import { AdminOrderListQuerySchema, type OrderStatus } from "@grabmarket/contracts";

export interface AdminOrderSearch {
  status?: OrderStatus;
  q?: string;
  page: number;
}

/** 주소의 조건을 계약 스키마로 검사한다. 모양이 틀리면 null(화면은 찾을 수 없음으로 다룬다). */
export function parseAdminOrderSearch(params: URLSearchParams): AdminOrderSearch | null {
  const parsed = AdminOrderListQuerySchema.safeParse(Object.fromEntries(params));
  if (!parsed.success) return null;
  const { status, q, page } = parsed.data;
  return { status, q: q === "" ? undefined : q, page };
}

/** 조건을 주소로. 1쪽과 빈 조건은 적지 않는다. */
export function adminOrdersPath({ status, q, page }: AdminOrderSearch): string {
  const params = new URLSearchParams();
  if (status !== undefined) params.set("status", status);
  if (q !== undefined) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const text = params.toString();
  return text === "" ? "/admin/orders" : `/admin/orders?${text}`;
}
