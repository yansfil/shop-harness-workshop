import type { CategorySlug } from "@grabmarket/contracts";
import { Fragment } from "react";
import { useLoaderData } from "react-router";
import { callApi } from "../api/client.ts";
import { LinkButton } from "../components/button.tsx";
import { STEPS } from "../components/order-steps.tsx";
import { InfoTable } from "../components/info-table.tsx";
import { Page } from "../components/page.tsx";
import { returnPolicyRows } from "../components/return-policy.tsx";
import { ShippingFee } from "../components/shipping-fee.tsx";
import { StatusBadge } from "../components/status-badge.tsx";
import { type DeliveryDay, deliveryDay } from "../lib/delivery.ts";
import { EDUCATION_NOTICE } from "../lib/education-notice.ts";
import { withEun } from "../lib/korean.ts";
import { streamed } from "../lib/streamed.ts";
import { useRootData } from "../state/root-data.ts";

export function helpLoader() {
  return { shipping: streamed(callApi("getShippingPolicy")) };
}

/** "식품·생활은 내일, 가전·패션은 모레 도착해요". 상품 카드 뱃지와 같은 기준(deliveryDay)으로 카테고리를 묶는다. */
export function arrivalSentence(categories: { slug: CategorySlug; name: string }[]): string {
  const groups = new Map<DeliveryDay, string[]>();
  for (const category of categories) {
    const day = deliveryDay(category.slug);
    groups.set(day, [...(groups.get(day) ?? []), category.name]);
  }
  return `${[...groups].map(([day, names]) => `${withEun(names.join("·"))} ${day}`).join(", ")} 도착해요`;
}

/** 고객센터: 배송 안내, 교환·반품 안내, 내 주문 바로가기. 전화·상담 시간·1:1 문의는 받을 곳이 없어 두지 않는다. */
export function HelpPage() {
  const { shipping } = useLoaderData<typeof helpLoader>();
  const { categories } = useRootData();
  return (
    <Page>
      <div className="mx-auto max-w-180 md:py-4">
        <h1 className="text-xl leading-8 font-extrabold text-ink">고객센터</h1>
        <p className="mt-1.5 text-sm text-ink-2 md:text-base">배송과 교환·반품 안내를 모았어요</p>

        <h2 className="mt-7 mb-3 text-base font-extrabold text-ink md:mt-9 md:text-lg">배송 안내</h2>
        <InfoTable
          rows={[
            { label: "배송비", value: <ShippingFee shipping={shipping} /> },
            { label: "도착", value: arrivalSentence(categories) },
            {
              label: "배송 상태",
              value: (
                <>
                  <ol aria-label="배송 상태 순서" className="flex flex-wrap items-center gap-1.5">
                    {STEPS.map((status, index) => (
                      <Fragment key={status}>
                        {index > 0 && (
                          <li aria-hidden="true" className="text-xs-plus text-ink-3">
                            ›
                          </li>
                        )}
                        <li>
                          <StatusBadge status={status} />
                        </li>
                      </Fragment>
                    ))}
                  </ol>
                  <p className="mt-1 text-ink-2">순서로 바뀌어요</p>
                </>
              ),
            },
          ]}
        />

        <h2 className="mt-7 mb-3 text-base font-extrabold text-ink md:mt-9 md:text-lg">교환과 반품</h2>
        <InfoTable rows={returnPolicyRows("help")} />

        <section
          aria-labelledby="help-orders-title"
          className="mt-7 flex flex-col gap-4 rounded-md border border-line bg-ground p-5 md:mt-9 md:flex-row md:items-center md:justify-between"
        >
          <div>
            <h2 id="help-orders-title" className="text-base font-extrabold text-ink">
              내 주문 확인
            </h2>
            <p className="mt-1 text-sm text-ink-2">주문한 상품과 지금 배송 상태를 볼 수 있어요</p>
          </div>
          <LinkButton to="/orders">내 주문 보기</LinkButton>
        </section>

        <p className="mt-6 text-xs-plus leading-5 text-ink-2">{EDUCATION_NOTICE}</p>
      </div>
    </Page>
  );
}
