import { Navigate, type RouteObject } from "react-router";
import { AdminGuard } from "./layouts/admin-layout.tsx";
import { CustomerLayout } from "./layouts/customer-layout.tsx";
import { CartPage, cartLoader } from "./routes/cart-page.tsx";
import { CategoryPage, categoryLoader } from "./routes/category-page.tsx";
import { CheckoutPage, checkoutLoader } from "./routes/checkout-page.tsx";
import { HomePage, homeLoader } from "./routes/home-page.tsx";
import { LoginPage, loginAction } from "./routes/login-page.tsx";
import { NotFoundPage } from "./routes/not-found-page.tsx";
import { MyOrderPage, MyOrdersPage, OrderCompletePage, myOrderLoader, myOrdersLoader } from "./routes/orders-pages.tsx";
import { ProductPage, productLoader } from "./routes/product-page.tsx";
import { RootError, RootFallback, logoutAction, logoutLoader, rootLoader } from "./routes/root.tsx";
import { SearchPage, searchLoader } from "./routes/search-page.tsx";
import { ROOT_ROUTE_ID } from "./state/root-data.ts";

/** 화면 경로 표. 화면을 더할 때 여기에 한 줄씩 더한다. */
export const routes: RouteObject[] = [
  {
    id: ROOT_ROUTE_ID,
    path: "/",
    loader: rootLoader,
    HydrateFallback: RootFallback,
    errorElement: <RootError />,
    children: [
      {
        element: <CustomerLayout />,
        children: [
          { index: true, element: <HomePage />, loader: homeLoader, handle: { mobileCategories: true } },
          { path: "category/:slug", element: <CategoryPage />, loader: categoryLoader, handle: { mobileCategories: true } },
          { path: "search", element: <SearchPage />, loader: searchLoader, handle: { mobileCategories: true } },
          { path: "products/:productId", element: <ProductPage />, loader: productLoader },
          { path: "cart", element: <CartPage />, loader: cartLoader },
          { path: "checkout", element: <CheckoutPage />, loader: checkoutLoader },
          { path: "orders", element: <MyOrdersPage />, loader: myOrdersLoader },
          { path: "orders/:orderId", element: <MyOrderPage />, loader: myOrderLoader },
          { path: "orders/:orderId/complete", element: <OrderCompletePage />, loader: myOrderLoader },
          { path: "login", element: <LoginPage />, action: loginAction },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
      { path: "admin", element: <AdminGuard />, children: [{ index: true, element: <Navigate to="/admin/orders" replace /> }] },
      { path: "logout", loader: logoutLoader, action: logoutAction },
    ],
  },
];
