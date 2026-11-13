import { streamed } from "../lib/streamed.ts";
import { useMemo, useState } from "react";
import { Link, useLoaderData, useNavigate } from "react-router";
import { AdminOrderNotice } from "../components/admin-order-notice.tsx";
import { Button, LinkButton } from "../components/button.tsx";
import { Checkbox } from "../components/checkbox.tsx";
import { Loaded } from "../components/loaded.tsx";
import { Page } from "../components/page.tsx";
import { ProductBadge } from "../components/product-card.tsx";
import { QuantityStepper } from "../components/quantity-stepper.tsx";
import { Bone, EmptyState, FailureState } from "../components/states.tsx";
import { AmountRows, SummaryCard } from "../components/summary-box.tsx";
import { effectiveQuantity, isOrderable, loadPricedLines, type PricedLine } from "../lib/cart-products.ts";
import { krw } from "../lib/format.ts";
import { loginPath } from "../lib/login-path.ts";
import { useQuote } from "../lib/use-quote.ts";
import { cartStore, removeFromCart, setCartQuantity, setCartSelected, useCartLines } from "../state/cart.ts";
import { useRootData } from "../state/root-data.ts";

export function cartLoader() {
  return { rows: streamed(loadPricedLines(cartStore.get())) };
}

export function CartPage() {
  const { rows } = useLoaderData<typeof cartLoader>();
  return (
    <Page>
      <h1 className="mb-4 text-xl leading-8 font-extrabold text-ink">장바구니</h1>
      <Loaded
        resolve={rows}
        failure="장바구니 상품을 불러오지 못했어요"
        skeleton={
          <div aria-hidden="true" className="flex flex-col gap-3 rounded-md border border-line bg-ground p-6">
            <Bone className="h-6 w-40" />
            <Bone className="h-24 w-full" />
            <Bone className="h-24 w-full" />
          </div>
        }
      >
        {(loaded) => <CartView loaded={loaded} />}
      </Loaded>
    </Page>
  );
}

function CartView({ loaded }: { loaded: PricedLine[] }) {
  const { user, categories } = useRootData();
  const navigate = useNavigate();
  const lines = useCartLines();
  const [attempt, setAttempt] = useState(0);
  const [adminNotice, setAdminNotice] = useState(false);

  const rows = useMemo(() => {
    const byId = new Map(loaded.map((row) => [row.line.productId, row.product]));
    return lines.flatMap((line) => (byId.has(line.productId) ? [{ line, product: byId.get(line.productId) ?? null }] : []));
  }, [loaded, lines]);

  const orderable = rows.filter(isOrderable);
  const checked = orderable.filter((row) => row.line.selected);
  const quote = useQuote(
    checked.map((row) => ({ productId: row.line.productId, quantity: effectiveQuantity(row) })),
    attempt,
  );
  const shortageById = new Map(quote.status === "ready" ? quote.data.shortages.map((item) => [item.productId, item]) : []);

  if (rows.length === 0) {
    return (
      <EmptyState title="장바구니가 비어 있어요" hint="마음에 드는 상품을 담아 보세요">
        {categories.map((category) => (
          <LinkButton key={category.slug} to={`/category/${category.slug}`} variant="secondary" className="min-w-17">
            {category.name}
          </LinkButton>
        ))}
        <LinkButton to="/" size="lg" className="mt-4 w-full max-w-60">
          쇼핑 계속하기
        </LinkButton>
      </EmptyState>
    );
  }

  const allSelected = orderable.length > 0 && checked.length === orderable.length;
  const amounts = quote.status === "ready" ? quote.data : null;
  const canOrder = checked.length > 0 && quote.status === "ready" && quote.data.shortages.length === 0;

  function order() {
    if (user === null) void navigate(loginPath("/checkout"));
    else if (user.role === "admin") setAdminNotice(true);
    else void navigate("/checkout");
  }

  const orderButton = (
    <Button size="lg" className="w-full" disabled={!canOrder} onClick={order}>
      주문하기
    </Button>
  );

  return (
    <div className="pb-48 lg:grid lg:grid-cols-[minmax(0,1fr)_22.5rem] lg:items-start lg:gap-6 lg:pb-0">
      <section aria-label="담은 상품" className="rounded-md border border-line bg-ground">
        <div className="flex h-14 items-center justify-between border-b border-line px-4 md:px-6">
          <Checkbox
            visibleLabel
            checked={allSelected}
            disabled={orderable.length === 0}
            label={`전체 선택 ${checked.length}/${rows.length}`}
            onChange={(value) => {
              setCartSelected(
                orderable.map((row) => row.line.productId),
                value,
              );
            }}
          />
          <button
            type="button"
            disabled={rows.every((row) => !row.line.selected)}
            onClick={() => {
              removeFromCart(rows.filter((row) => row.line.selected).map((row) => row.line.productId));
            }}
            className="text-xs-plus font-semibold text-ink disabled:text-ink-3"
          >
            선택 삭제
          </button>
        </div>
        <ul>
          {rows.map((row) => (
            <CartRow key={row.line.productId} row={row} shortage={shortageById.get(row.line.productId)?.available} />
          ))}
        </ul>
      </section>
      <aside aria-label="결제 금액" className="max-lg:hidden lg:sticky lg:top-6">
        <SummaryCard>
          <AmountRows amounts={amounts} status={checked.length === 0 ? "idle" : quote.status} />
          {quote.status === "error" && (
            <div className="mt-3">
              <FailureState
                title="금액을 확인하지 못했어요"
                onRetry={() => {
                  setAttempt((value) => value + 1);
                }}
              />
            </div>
          )}
          <div className="mt-6">{orderButton}</div>
        </SummaryCard>
      </aside>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ground p-4 lg:hidden">
        <div className="flex items-center justify-between text-xs-plus text-ink-2">
          <span>상품 합계 {amounts !== null ? krw(amounts.subtotal) : "-"}</span>
          <span>배송비 {amounts !== null ? krw(amounts.shippingFee) : "-"}</span>
        </div>
        <div className="mt-1 mb-3 flex items-center justify-between">
          <span className="text-sm font-bold text-ink">결제 금액</span>
          <span className="text-2xl leading-8 font-extrabold text-ink">{amounts !== null ? krw(amounts.total) : checked.length === 0 ? krw(0) : "-"}</span>
        </div>
        {orderButton}
      </div>
      {adminNotice && (
        <AdminOrderNotice
          next="/cart"
          onClose={() => {
            setAdminNotice(false);
          }}
        />
      )}
    </div>
  );
}

function CartRow({ row, shortage }: { row: PricedLine; shortage: number | undefined }) {
  const { line, product } = row;

  if (product === null) {
    return (
      <li className="flex items-center justify-between gap-4 border-b border-line p-4 last:border-b-0 md:px-6">
        <span className="text-sm text-ink-2">더 이상 판매하지 않는 상품이에요</span>
        <button
          type="button"
          onClick={() => {
            removeFromCart([line.productId]);
          }}
          className="text-xs-plus font-semibold text-ink-2"
        >
          삭제
        </button>
      </li>
    );
  }

  const soldOut = product.stockQuantity === 0;
  const quantity = soldOut ? 0 : effectiveQuantity({ line, product });
  const max = Math.min(product.stockQuantity, 99);
  const selected = line.selected && !soldOut;

  return (
    <li className="grid grid-cols-[auto_4.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 border-b border-line p-4 last:border-b-0 md:grid-cols-[auto_6rem_minmax(0,1fr)_auto_7rem_auto] md:items-center md:gap-x-4 md:px-6 md:py-4">
      <Checkbox
        checked={selected}
        disabled={soldOut}
        label={`${product.name} 선택`}
        onChange={(value) => {
          setCartSelected([line.productId], value);
        }}
      />
      <Link to={`/products/${product.id}`} className="block aspect-square overflow-hidden rounded-sm bg-canvas">
        <img src={product.imageUrl} alt="" loading="lazy" className={`size-full object-cover ${soldOut ? "opacity-45" : ""}`} />
      </Link>
      <div className="min-w-0">
        <Link to={`/products/${product.id}`} className={`block text-sm leading-5 font-semibold md:text-base md:leading-6 ${soldOut ? "text-ink-3" : "text-ink"}`}>
          {product.name}
        </Link>
        <p className="mt-0.5 text-xs-plus text-ink-3">개당 {krw(product.price)}</p>
        <ProductBadge product={product} className="mt-1.5" />
        {shortage !== undefined && (
          <p role="alert" className="mt-1.5 text-xs font-bold text-danger">
            재고 부족 · 남은 수량 {shortage}개
          </p>
        )}
      </div>
      <div className="col-start-3 flex flex-col items-start gap-1 md:col-start-auto md:items-center">
        <QuantityStepper
          label={product.name}
          value={quantity}
          min={soldOut ? 0 : 1}
          max={max}
          disabled={soldOut}
          onChange={(value) => {
            setCartQuantity(line.productId, value, max);
          }}
        />
        {!soldOut && quantity >= max && product.stockStatus === "low" && (
          <span className="text-xs font-semibold text-status-preparing-text">최대 {max}개까지 담을 수 있어요</span>
        )}
      </div>
      <p className={`col-start-3 text-base font-extrabold md:col-start-auto md:text-right md:text-lg ${selected ? "text-ink" : "text-ink-3"}`}>
        {soldOut ? "품절" : krw(product.price * quantity)}
      </p>
      <button
        type="button"
        aria-label={`${product.name} 삭제`}
        onClick={() => {
          removeFromCart([line.productId]);
        }}
        className="col-start-3 justify-self-start text-xs-plus font-semibold text-ink-2 md:col-start-auto md:justify-self-end"
      >
        삭제
      </button>
    </li>
  );
}

