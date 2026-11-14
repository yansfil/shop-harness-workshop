import type { ProductDetail, ShippingPolicyResponse } from "@grabmarket/contracts";
import { type KeyboardEvent, Suspense, useRef, useState } from "react";
import { Await } from "react-router";
import { krw } from "../lib/format.ts";
import { Bone } from "./states.tsx";

const TABS = [
  { key: "story", label: "상품설명" },
  { key: "info", label: "상품정보" },
  { key: "delivery", label: "배송과 교환 안내" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/** 교환·반품 안내는 모든 상품에 같은 글이다. */
const RETURN_NOTICE = "받은 날부터 7일 안에 고객센터로 알려 주세요. 신선식품은 단순 변심으로 교환·반품할 수 없습니다.";

/** 상품 상세 아래의 탭 3개: 상품설명, 상품정보, 배송과 교환 안내. 후기 탭은 없다. */
export function ProductTabs({ product, shipping }: { product: ProductDetail; shipping: Promise<ShippingPolicyResponse> }) {
  const [active, setActive] = useState<TabKey>("story");
  const tabRefs = useRef<Record<TabKey, HTMLButtonElement | null>>({ story: null, info: null, delivery: null });

  function move(event: KeyboardEvent, index: number) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = TABS[(index + step + TABS.length) % TABS.length];
    if (next === undefined) return;
    setActive(next.key);
    tabRefs.current[next.key]?.focus();
  }

  return (
    <section aria-label="상품 안내" className="mt-8 max-md:mt-2 max-md:border-t-8 max-md:border-canvas">
      <div role="tablist" aria-label="상품 안내" className="grid grid-cols-3 border-b border-line bg-ground md:sticky md:top-0 md:z-20 md:rounded-t-md md:border">
        {TABS.map((tab, index) => {
          const selected = tab.key === active;
          return (
            <button
              key={tab.key}
              ref={(node) => {
                tabRefs.current[tab.key] = node;
              }}
              type="button"
              role="tab"
              id={`product-tab-${tab.key}`}
              aria-selected={selected}
              aria-controls={`product-panel-${tab.key}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => {
                setActive(tab.key);
              }}
              onKeyDown={(event) => {
                move(event, index);
              }}
              className={`h-12 border-b-2 text-sm md:h-14 md:text-base ${selected ? "border-ink font-extrabold text-ink" : "border-transparent font-semibold text-ink-3"} focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`product-panel-${active}`}
        aria-labelledby={`product-tab-${active}`}
        className="bg-ground px-4 pt-10 pb-10 md:rounded-b-md md:border md:border-t-0 md:border-line md:px-8 md:pt-14 md:pb-16"
      >
        {active === "story" && <StoryPanel product={product} />}
        {active === "info" && <InfoPanel product={product} />}
        {active === "delivery" && <DeliveryPanel shipping={shipping} />}
      </div>
    </section>
  );
}

function StoryPanel({ product }: { product: ProductDetail }) {
  const { story, variants } = product;
  // 큰 사진과 보관 방법 옆 사진은 같은 상품의 다른 옵션 사진을 다시 쓴다. 새 사진은 없다.
  const others = variants.filter((variant) => variant.id !== product.id);
  const bigPhoto = others[0]?.imageUrl ?? product.imageUrl;
  const carePhoto = others[1]?.imageUrl;
  return (
    <div className="mx-auto max-w-180">
      <div className="text-center">
        <p className="text-sm font-bold text-ink-3">{story.eyebrow}</p>
        <h2 className="mt-2.5 text-xl leading-7.5 font-extrabold tracking-tight whitespace-pre-line md:text-3xl md:leading-10">{story.headline}</h2>
        <p className="mx-auto mt-5 max-w-150 text-start text-sm leading-7 text-ink-2 md:text-center md:text-base md:leading-8">{story.intro}</p>
      </div>
      <img src={bigPhoto} alt="" className="mt-8 aspect-square w-full rounded-sm bg-canvas object-cover md:mt-10 md:aspect-4/3" />
      <ol className="mt-8 grid gap-2 md:mt-12 md:grid-cols-3 md:gap-4">
        {story.points.map((point, index) => (
          <li key={point.title} className="rounded-md bg-canvas p-5">
            <span className="text-xs font-extrabold tracking-wider text-ink-3">POINT {index + 1}</span>
            <h3 className="mt-2 text-base font-extrabold text-ink">{point.title}</h3>
            <p className="mt-1.5 text-sm leading-6 text-ink-2">{point.body}</p>
          </li>
        ))}
      </ol>
      <div className={`mt-10 grid items-center gap-6 md:mt-12 ${carePhoto === undefined ? "" : "md:grid-cols-2"}`}>
        {carePhoto !== undefined && <img src={carePhoto} alt="" className="aspect-square w-full rounded-sm bg-canvas object-cover" />}
        <div>
          <h3 className="text-lg font-extrabold text-ink">{story.care.title}</h3>
          <p className="mt-2.5 text-sm leading-7 text-ink-2 md:text-base md:leading-8">{story.care.body}</p>
        </div>
      </div>
      <h3 className="mt-14 mb-3 text-lg font-extrabold text-ink md:mt-16">옵션별 구성</h3>
      <ul>
        {variants.map((variant) => (
          <li key={variant.id} className="grid grid-cols-[64px_1fr] items-center gap-x-3 gap-y-0.5 border-b border-line py-2 md:grid-cols-[64px_80px_1fr_auto] md:gap-x-4">
            <img src={variant.imageUrl} alt="" className="row-span-3 size-16 rounded-sm bg-canvas object-cover md:row-span-1" />
            <span className="text-sm font-bold text-ink">{variant.optionLabel ?? "기본"}</span>
            <span className="text-sm text-ink-2">{variant.note}</span>
            <span className="text-sm font-bold text-ink md:text-end">{krw(variant.price)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const tableHead = "w-28 bg-canvas px-4 py-3.5 text-start align-top text-sm font-semibold text-ink-2 md:w-40";
const tableCell = "px-4 py-3.5 text-sm leading-6 text-ink";

function InfoPanel({ product }: { product: ProductDetail }) {
  const rows = [{ label: "상품명", value: product.name }, ...product.story.info];
  return (
    <div className="mx-auto max-w-180">
      <h2 className="mb-3 text-lg font-extrabold text-ink">상품정보</h2>
      <table className="w-full border-t-2 border-ink">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-line">
              <th scope="row" className={tableHead}>
                {row.label}
              </th>
              <td className={tableCell}>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeliveryPanel({ shipping }: { shipping: Promise<ShippingPolicyResponse> }) {
  return (
    <div className="mx-auto max-w-180">
      <h2 className="mb-3 text-lg font-extrabold text-ink">배송과 교환 안내</h2>
      <table className="w-full border-t-2 border-ink">
        <tbody>
          <tr className="border-b border-line">
            <th scope="row" className={tableHead}>
              배송비
            </th>
            <td className={tableCell}>
              <Suspense fallback={<Bone className="h-5 w-48" />}>
                <Await resolve={shipping} errorElement={<span className="text-ink-3">배송비 안내를 불러오지 못했어요</span>}>
                  {(policy: ShippingPolicyResponse) => `${krw(policy.freeThreshold)} 이상 주문하면 무료, 그 밖에는 ${krw(policy.fee)}`}
                </Await>
              </Suspense>
            </td>
          </tr>
          <tr className="border-b border-line">
            <th scope="row" className={tableHead}>
              교환·반품
            </th>
            <td className={tableCell}>{RETURN_NOTICE}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
