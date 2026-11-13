import { Navigate, type RouteObject } from "react-router";
import { AdminGuard } from "./layouts/admin-layout.tsx";
import { CustomerLayout } from "./layouts/customer-layout.tsx";
import { AdminOrderPage, AdminOrdersPage, adminOrderLoader, adminOrdersLoader } from "./routes/admin-orders-pages.tsx";
import { AdminInventoryPage, inventoryLoader } from "./routes/admin-inventory-page.tsx";
import { CartPage, cartLoader } from "./routes/cart-page.tsx";
import { CategoryPage, categoryLoader } from "./routes/category-page.tsx";
import { CheckoutPage, checkoutLoader } from "./routes/checkout-page.tsx";
import { HomePage, homeLoader } from "./routes/home-page.tsx";
import { LoginPage, loginAction } from "./routes/login-page.tsx";
import { NotFoundPage } from "./routes/not-found-page.tsx";
import { MyOrdersPage, OrderCompletePage, myOrderLoader, myOrdersLoader } from "./routes/orders-pages.tsx";
import { AccountLayout } from "./legacy/account-layout.tsx";
import { OrderDetailPage, orderDetailLoader } from "./legacy/order-detail-page.tsx";
import { PointsPage, pointsLoader } from "./legacy/points-page.tsx";
import { CouponsPage, couponsLoader } from "./legacy/coupons-page.tsx";
import { TrackingPage, trackingLoader } from "./legacy/tracking-page.tsx";
import { ShipmentsPage, shipmentsLoader } from "./legacy/shipments-page.tsx";
import { MyReturnsPage, ReturnFormPage, myReturnsLoader, returnFormLoader } from "./legacy/returns-pages.tsx";
import { NotificationsPage, notificationsLoader } from "./legacy/notifications-page.tsx";
import {
  BreakdownPage,
  DailySettlementPage,
  MonthlySettlementPage,
  PaymentsPage,
  PayoutsPage,
  breakdownLoader,
  dailyLoader,
  monthlyLoader,
  paymentsLoader,
  payoutsLoader,
} from "./legacy/admin/settlement-pages.tsx";
import { AdminCouponsPage, adminCouponsLoader } from "./legacy/admin/coupon-page.tsx";
import { AdminPointsPage, adminPointsLoader } from "./legacy/admin/points-admin-page.tsx";
import { AdminShipmentsPage, adminShipmentsLoader } from "./legacy/admin/shipments-admin-page.tsx";
import { AdminReturnsPage, adminReturnsLoader } from "./legacy/admin/returns-admin-page.tsx";
import { QueuePage, queueLoader } from "./legacy/admin/queue-page.tsx";
import { BatchPage, batchLoader } from "./legacy/admin/batch-page.tsx";
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
          {
            element: <AccountLayout />,
            children: [
              { path: "orders", element: <MyOrdersPage />, loader: myOrdersLoader },
              { path: "orders/:orderId", element: <OrderDetailPage />, loader: orderDetailLoader },
              { path: "orders/:orderId/tracking", element: <TrackingPage />, loader: trackingLoader },
              { path: "shipments", element: <ShipmentsPage />, loader: shipmentsLoader },
              { path: "points", element: <PointsPage />, loader: pointsLoader },
              { path: "coupons", element: <CouponsPage />, loader: couponsLoader },
              { path: "returns", element: <MyReturnsPage />, loader: myReturnsLoader },
              { path: "returns/new", element: <ReturnFormPage />, loader: returnFormLoader },
              { path: "notifications", element: <NotificationsPage />, loader: notificationsLoader },
            ],
          },
          { path: "orders/:orderId/complete", element: <OrderCompletePage />, loader: myOrderLoader },
          { path: "login", element: <LoginPage />, action: loginAction },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
      { path: "admin", element: <AdminGuard />, children: [
          { index: true, element: <Navigate to="/admin/orders" replace /> },
          { path: "orders", element: <AdminOrdersPage />, loader: adminOrdersLoader },
          { path: "orders/:orderId", element: <AdminOrderPage />, loader: adminOrderLoader },
          { path: "inventory", element: <AdminInventoryPage />, loader: inventoryLoader },
          { path: "settlements", element: <DailySettlementPage />, loader: dailyLoader },
          { path: "settlements/monthly", element: <MonthlySettlementPage />, loader: monthlyLoader },
          { path: "settlements/breakdown", element: <BreakdownPage />, loader: breakdownLoader },
          { path: "settlements/payouts", element: <PayoutsPage />, loader: payoutsLoader },
          { path: "settlements/payments", element: <PaymentsPage />, loader: paymentsLoader },
          { path: "coupons", element: <AdminCouponsPage />, loader: adminCouponsLoader },
          { path: "points", element: <AdminPointsPage />, loader: adminPointsLoader },
          { path: "shipments", element: <AdminShipmentsPage />, loader: adminShipmentsLoader },
          { path: "returns", element: <AdminReturnsPage />, loader: adminReturnsLoader },
          { path: "notifications", element: <QueuePage />, loader: queueLoader },
          { path: "batch", element: <BatchPage />, loader: batchLoader },
        ],
      },
      { path: "logout", loader: logoutLoader, action: logoutAction },
    ],
  },
];
