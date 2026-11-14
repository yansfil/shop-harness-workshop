import { type ProductDetail, ProductParamsSchema, type ShippingPolicyResponse } from "@grabmarket/contracts";
import { useEffect, useState } from "react";
import { Link, type LoaderFunctionArgs, useLoaderData, useNavigate } from "react-router";
import { streamed } from "../lib/streamed.ts";
import { callApi } from "../api/client.ts";
import { Button, LinkButton } from "../components/button.tsx";
import { Loaded } from "../components/loaded.tsx";
import { ProductBadge, ProductGrid, ProductGridSkeleton } from "../components/product-card.tsx";
import { OptionChips, OptionPhotoRow } from "../components/product-options.tsx";
import { ProductTabs } from "../components/product-tabs.tsx";
import { QuantityStepper } from "../components/quantity-stepper.tsx";
import { Bone, EmptyState } from "../components/states.tsx";
import { groupDigits, krw } from "../lib/format.ts";
import { NotFoundError } from "../lib/not-found.ts";
import { useQuote } from "../lib/use-quote.ts";
import { addToCart, MAX_LINE_QUANTITY, useCartLines } from "../state/cart.ts";

const RELATED_COUNT = 5;

export function productLoader({ params }: LoaderFunctionArgs) {
  const parsed = ProductParamsSchema.safeParse(params);
  if (!parsed.success) throw new NotFoundError("찾을 수 없는 상품입니다");
  const product = callApi("getProduct", { params: { productId: parsed.data.productId } });
  const related = product.then((data) => callApi("searchProducts", { query: { category: data.product.category.slug } }));
  const shipping = callApi("getShippingPolicy");
  return { product: streamed(product), related: streamed(related), shipping: streamed(shipping) };
}

export function ProductPage() {
  const { product, related, shipping } = useLoaderData<typeof productLoader>();
  return (
    <Loaded
      resolve={product}
      failure="상품 정보를 불러오지 못했어요"
      skeleton={<ProductSkeleton />}
      notFound={
        <EmptyState title="상품을 찾을 수 없어요" hint="주소를 다시 확인하거나 다른 상품을 찾아보세요">
          <LinkButton to="/" size="lg">
            전체 상품 보기
          </LinkButton>
        </EmptyState>
      }
    >
      {({ product: detail }) => (
        <>
          <ProductDetailView key={detail.id} product={detail} shipping={shipping} />
          <section className="px-4 pt-8 pb-24 max-md:hidden md:px-8 md:pb-10">
            <h2 className="text-lg leading-7 font-extrabold text-ink">{detail.category.name} 상품 더 보기</h2>
            <div className="mt-4">
              <Loaded resolve={related} failure="다른 상품을 불러오지 못했어요" skeleton={<ProductGridSkeleton count={RELATED_COUNT} />}>
                {(data) => (
                  <ProductGrid products={data.products.filter((item) => item.id !== detail.id).slice(0, RELATED_COUNT)} />
                )}
              </Loaded>
            </div>
          </section>
        </>
      )}
    </Loaded>
  );
}

function ProductSkeleton() {
  return (
    <div aria-hidden="true" className="md:px-8 md:py-6">
      <div className="animate-pulse bg-line md:hidden" style={{ aspectRatio: "1 / 1" }} />
      <div className="flex flex-col gap-4 p-4 md:grid md:grid-cols-[minmax(0,520px)_1fr] md:gap-8 md:rounded-md md:border md:border-line md:bg-ground md:p-6">
        <div className="hidden aspect-square animate-pulse rounded-sm bg-line md:block" />
        <div className="flex flex-col gap-4">
          <Bone className="h-8 w-2/3" />
          <Bone className="h-12 w-1/2" />
          <Bone className="h-6 w-24" />
        </div>
      </div>
    </div>
  );
}

function ProductDetailView({ product, shipping }: { product: ProductDetail; shipping: Promise<ShippingPolicyResponse> }) {
  const navigate = useNavigate();
  const lines = useCartLines();
  const soldOut = product.stockStatus === "sold_out";
  const inCart = lines.find((line) => line.productId === product.id)?.quantity ?? 0;
  const limit = Math.min(product.stockQuantity, MAX_LINE_QUANTITY);
  const room = Math.max(limit - inCart, 0);
  const [wanted, setWanted] = useState(1);
  const [toastKey, setToastKey] = useState(0);
  const quantity = soldOut ? 0 : Math.min(wanted, Math.max(room, 1));
  const canAdd = !soldOut && room > 0;
  const quote = useQuote(canAdd ? [{ productId: product.id, quantity }] : []);
  const atLimit = !soldOut && quantity >= Math.max(room, 1) && product.stockStatus === "low";

  function add() {
    addToCart(product.id, quantity, limit);
    setToastKey((value) => value + 1);
  }

  function buyNow() {
    void navigate(`/checkout?productId=${product.id}&quantity=${quantity}`);
  }

  return (
    <div className="pb-24 md:px-8 md:py-4 md:pb-0">
      <nav aria-label="현재 위치" className="max-md:hidden">
        <ol className="flex items-center gap-2 py-2 text-xs-plus text-ink-2">
          <li>
            <Link to={`/category/${product.category.slug}`}>{product.category.name}</Link>
          </li>
          <li aria-hidden="true">&gt;</li>
          <li aria-current="page" className="font-semibold text-ink">
            {product.name}
          </li>
        </ol>
      </nav>
      <div className="md:grid md:grid-cols-[minmax(0,520px)_1fr] md:gap-8 md:rounded-md md:border md:border-line md:bg-ground md:p-6">
        <div>
          <div className="aspect-square bg-canvas md:rounded-sm">
            <img src={product.imageUrl} alt={product.name} className={`size-full object-cover md:rounded-sm ${soldOut ? "opacity-45" : ""}`} />
          </div>
          {product.variants.length > 1 && (
            <div className="md:mt-3">
              <OptionPhotoRow variants={product.variants} currentId={product.id} />
            </div>
          )}
        </div>
        <div className="p-4 md:p-0">
          <h1 className="text-base leading-6 font-medium text-ink-2 md:text-3xl md:leading-9 md:font-extrabold md:text-ink">{product.name}</h1>
          <p className="mt-1 text-xs-plus leading-5 text-ink-3 md:mt-2 md:text-base md:leading-6 md:text-ink-2">{product.description}</p>
          <p className={`mt-2 flex items-baseline gap-1 md:mt-5 ${soldOut ? "text-ink-3" : "text-ink"}`}>
            <span className="text-3xl leading-none font-extrabold tracking-tight md:text-price-xl">{groupDigits(product.price)}</span>
            <span className="text-lg font-bold">원</span>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ProductBadge product={product} />
            {soldOut && <span className="text-xs-plus text-ink-2">지금은 담거나 구매할 수 없어요</span>}
          </div>
          {product.variants.length > 1 && (
            <div className="mt-5">
              <h2 className="mb-2 text-sm text-ink-3">옵션 고르기</h2>
              <OptionChips variants={product.variants} currentId={product.id} />
            </div>
          )}
          <dl className="mt-5 border-t border-line md:mt-6">
            {canAdd && (
              <div className="flex h-14 items-center justify-between border-b border-line">
                <dt className="text-sm text-ink-3">배송비</dt>
                <dd className="text-sm font-semibold text-ink">
                  {quote.status === "ready" ? krw(quote.data.shippingFee) : quote.status === "error" ? "확인하지 못했어요" : <Bone className="h-4 w-14" />}
                </dd>
              </div>
            )}
            <div className="flex min-h-14 items-center justify-between border-b border-line py-2">
              <dt className="text-sm text-ink-3">수량</dt>
              <dd className="flex flex-col items-end gap-1">
                <QuantityStepper
                  label={product.name}
                  value={quantity}
                  min={soldOut ? 0 : 1}
                  max={soldOut ? 0 : Math.max(room, 1)}
                  disabled={!canAdd}
                  onChange={setWanted}
                />
                {atLimit && <span className="text-xs font-semibold text-status-preparing-text">최대 {quantity + inCart}개까지 담을 수 있어요</span>}
                {!soldOut && room === 0 && <span className="text-xs font-semibold text-status-preparing-text">담을 수 있는 최대 수량({inCart}개)을 이미 담았어요</span>}
              </dd>
            </div>
            {canAdd && (
              <div className="flex h-16 items-center justify-between max-md:hidden">
                <dt className="text-sm font-bold text-ink">총 상품 금액</dt>
                <dd className="text-xl font-extrabold text-ink">{krw(product.price * quantity)}</dd>
              </div>
            )}
          </dl>
          <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-line bg-ground p-4 md:static md:mt-4 md:border-0 md:bg-transparent md:p-0">
            <Button variant="secondary" size="lg" className="flex-1" disabled={!canAdd} onClick={add}>
              장바구니 담기
            </Button>
            <Button size="lg" className="flex-1" disabled={soldOut} onClick={buyNow}>
              바로 구매
            </Button>
          </div>
        </div>
      </div>
      <ProductTabs product={product} shipping={shipping} />
      <AddedToast key={toastKey} show={toastKey > 0} />
    </div>
  );
}

/** 담은 직후 아래쪽에 잠깐 뜨는 안내. 4초 뒤 사라진다. */
function AddedToast({ show }: { show: boolean }) {
  const [visible, setVisible] = useState(show);
  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(() => {
      setVisible(false);
    }, 4000);
    return () => {
      clearTimeout(timer);
    };
  }, [show]);
  if (!show || !visible) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-24 z-40 flex h-14 items-center justify-between rounded-md bg-ink px-4 text-sm font-semibold text-on-dark md:inset-x-auto md:right-8 md:bottom-8 md:w-96"
    >
      장바구니에 담았어요
      <Link to="/cart" className="font-bold text-accent">
        장바구니 보기
      </Link>
    </div>
  );
}
