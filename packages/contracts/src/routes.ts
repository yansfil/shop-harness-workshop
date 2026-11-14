// 모든 API 경로. 서버(Express)는 패턴을 그대로 등록하고, 화면은 buildPath로 실제 경로를 만든다.
export const ROUTES = {
  health: "/api/health",

  login: "/api/auth/login",
  logout: "/api/auth/logout",
  me: "/api/auth/me",

  categories: "/api/categories",
  products: "/api/products",
  productSuggest: "/api/products/suggest",
  product: "/api/products/:productId",

  events: "/api/events",
  event: "/api/events/:slug",

  shippingPolicy: "/api/shipping-policy",
  orderQuote: "/api/orders/quote",
  orders: "/api/orders",
  order: "/api/orders/:orderId",

  adminOrders: "/api/admin/orders",
  adminOrder: "/api/admin/orders/:orderId",
  adminOrderStatus: "/api/admin/orders/:orderId/status",

  adminInventory: "/api/admin/inventory",
  adminInventoryMovements: "/api/admin/inventory/:productId/movements",
  adminInventoryInbound: "/api/admin/inventory/:productId/inbound",
} as const;

export type RoutePattern = (typeof ROUTES)[keyof typeof ROUTES];

type CollectParams<P extends string> = P extends `${string}:${infer Name}/${infer Rest}`
  ? Record<Name, string | number> & CollectParams<`/${Rest}`>
  : P extends `${string}:${infer Name}`
    ? Record<Name, string | number>
    : unknown;

type PathParams<P extends string> = P extends `${string}:${string}` ? CollectParams<P> : never;

/** buildPath(ROUTES.order, { orderId: 12 }) → "/api/orders/12". 값 자리가 없는 경로는 ROUTES 값을 그대로 쓴다. */
export function buildPath<P extends string>(pattern: P, params: PathParams<P>): string {
  const values = params as Record<string, string | number>;
  return pattern.replace(/:([A-Za-z]+)/g, (_, name: string) => {
    const value = values[name];
    if (value === undefined) throw new Error(`경로 값이 없습니다: ${name} (${pattern})`);
    return encodeURIComponent(String(value));
  });
}
