import { type InventoryItem, type InventoryMovement, MOVEMENT_KIND_LABELS } from "@grabmarket/contracts";
import { useRef, useState } from "react";
import { useLoaderData } from "react-router";
import { streamed } from "../lib/streamed.ts";
import { callApi, isApiError } from "../api/client.ts";
import { Button } from "../components/button.tsx";
import { Icon } from "../components/icon.tsx";
import { Loaded } from "../components/loaded.tsx";
import { Bone, EmptyState, FailureState } from "../components/states.tsx";
import { formatShortTime } from "../lib/format.ts";
import { useAsync } from "../lib/use-async.ts";

export function inventoryLoader() {
  return { result: streamed(callApi("listInventory")) };
}

export function AdminInventoryPage() {
  const { result } = useLoaderData<typeof inventoryLoader>();
  return (
    <Loaded
      resolve={result}
      failure="재고를 불러오지 못했어요"
      skeleton={
        <div aria-hidden="true" className="flex flex-col gap-3 rounded-md border border-line bg-ground p-4">
          {[0, 1, 2, 3, 4].map((index) => (
            <Bone key={index} className="h-10 w-full" />
          ))}
        </div>
      }
    >
      {({ items }) => <InventoryView initial={items} />}
    </Loaded>
  );
}

function InventoryView({ initial }: { initial: InventoryItem[] }) {
  const [items, setItems] = useState(initial);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [lowOnly, setLowOnly] = useState(false);
  const lowCount = items.filter((item) => item.lowStock).length;
  // 입고로 부족한 상품이 모두 사라지면 필터도 저절로 풀려서 빈 목록이 남지 않는다.
  const filtering = lowOnly && lowCount > 0;
  const visibleItems = filtering ? items.filter((item) => item.lowStock) : items;

  if (items.length === 0) {
    return (
      <>
        <Heading count={0} />
        <div className="rounded-md border border-line bg-ground">
          <EmptyState title="등록된 상품이 없어요" hint="상품이 올라오면 재고가 여기에 보여요" />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <Heading count={items.length} />
          {notice !== null && (
            <span role="status" className="rounded-sm bg-status-delivered-bg px-2 py-1 text-xs-plus font-bold text-status-delivered-text">
              {notice}
            </span>
          )}
        </div>
        <Button
          onClick={() => {
            setDrawerOpen(true);
          }}
        >
          입고 등록
        </Button>
      </div>
      {lowCount > 0 && (
        <button
          type="button"
          aria-pressed={filtering}
          onClick={() => {
            setLowOnly(!filtering);
          }}
          className="mb-3 flex h-12 w-full items-center justify-between rounded-md bg-danger-soft px-4 text-sm font-extrabold text-danger"
        >
          안전재고 미만 {lowCount}개
          <span aria-hidden="true" className="text-xs-plus font-semibold">
            {filtering ? "전체 보기" : "부족한 상품만 보기"}
          </span>
        </button>
      )}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="overflow-hidden rounded-md border border-line bg-ground">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="h-10 text-xs-plus text-ink-3">
                <th scope="col" className="px-6 font-normal">
                  상품
                </th>
                <th scope="col" className="px-3 font-normal">
                  카테고리
                </th>
                <th scope="col" className="px-6 text-right font-normal">
                  재고 수량
                </th>
                <th scope="col" className="px-6 text-right font-normal">
                  안전재고
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item) => {
                const selected = item.productId === selectedId;
                return (
                  <tr key={item.productId} aria-selected={selected} className={`h-12 border-t border-line ${selected ? "bg-accent-soft" : ""}`}>
                    <td className="px-6 font-semibold text-ink">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(item.productId);
                        }}
                        className="text-left"
                      >
                        {item.productName}
                      </button>
                      {item.lowStock && <span className="ml-2 rounded-sm bg-danger-soft px-2 py-0.5 align-middle text-xs font-bold whitespace-nowrap text-danger">안전재고 미만</span>}
                    </td>
                    <td className="px-3 text-ink-2">{item.categoryName}</td>
                    <td className={`px-6 text-right text-base font-extrabold ${item.quantity === 0 ? "text-ink-3" : "text-ink"}`}>{item.quantity}개</td>
                    <td className="px-6 text-right text-ink-2">{item.safetyStock}개</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <History item={items.find((item) => item.productId === selectedId) ?? null} version={historyVersion} />
      </div>
      {drawerOpen && (
        <InboundDrawer
          items={items}
          initialProductId={selectedId ?? items[0]?.productId ?? 0}
          onClose={() => {
            setDrawerOpen(false);
          }}
          onDone={(item, quantity) => {
            setItems((current) => current.map((candidate) => (candidate.productId === item.productId ? item : candidate)));
            setSelectedId(item.productId);
            setHistoryVersion((value) => value + 1);
            setNotice(`${item.productName} ${quantity}개를 입고했어요`);
            setDrawerOpen(false);
          }}
        />
      )}
    </>
  );
}

function Heading({ count }: { count: number }) {
  return (
    <h1 className="flex items-baseline gap-3 text-xl leading-8 font-extrabold text-ink">
      재고
      <span className="text-sm leading-5 font-semibold text-ink-2">상품 {count}개</span>
    </h1>
  );
}

/** 고른 상품의 입출고 이력(최신순). */
function History({ item, version }: { item: InventoryItem | null; version: number }) {
  const [attempt, setAttempt] = useState(0);
  const state = useAsync(item === null ? null : `${item.productId}:${version}:${attempt}`, () =>
    callApi("listInventoryMovements", { params: { productId: item?.productId ?? 0 } }),
  );

  let body;
  if (item === null) {
    body = <p className="px-4 py-10 text-center text-sm text-ink-3">상품을 고르면 입출고 이력이 보여요</p>;
  } else if (state.status === "loading" || state.status === "idle") {
    body = (
      <div aria-hidden="true" className="flex flex-col gap-3 p-4">
        <Bone className="h-10 w-full" />
        <Bone className="h-10 w-full" />
      </div>
    );
  } else if (state.status === "error") {
    body = <FailureState title="이력을 불러오지 못했어요" onRetry={() => { setAttempt((value) => value + 1); }} />;
  } else if (state.data.movements.length === 0) {
    body = (
      <div className="px-4 py-10 text-center">
        <p className="text-sm font-bold text-ink">아직 입출고 이력이 없어요</p>
        <p className="mt-1 text-xs-plus text-ink-3">입고를 등록하면 여기에 쌓여요</p>
      </div>
    );
  } else {
    body = (
      <ul>
        {state.data.movements.map((movement) => (
          <MovementRow key={movement.id} movement={movement} />
        ))}
      </ul>
    );
  }

  return (
    <aside aria-label="입출고 이력" className="overflow-hidden rounded-md border border-line bg-ground">
      <h2 className="flex h-12 items-center border-b border-line px-4 text-sm font-extrabold text-ink">
        입출고 이력{item !== null && <span className="ml-2 truncate font-medium text-ink-2">{item.productName}</span>}
      </h2>
      {body}
    </aside>
  );
}

function MovementRow({ movement }: { movement: InventoryMovement }) {
  const inbound = movement.kind === "inbound";
  return (
    <li className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-xs-plus text-ink-2">
          {formatShortTime(movement.createdAt)} · {MOVEMENT_KIND_LABELS[movement.kind]}
          {movement.orderNumber !== null && ` · 주문 ${movement.orderNumber}`}
        </p>
        <p className="mt-0.5 text-xs-plus text-ink-3">
          재고 {movement.quantityAfter}개{movement.memo !== null && ` · ${movement.memo}`}
        </p>
      </div>
      <span className={`shrink-0 text-lg font-extrabold ${inbound ? "text-status-delivered-text" : "text-ink"}`}>
        {inbound ? "+" : ""}
        {movement.quantityDelta}
      </span>
    </li>
  );
}

function InboundDrawer({
  items,
  initialProductId,
  onClose,
  onDone,
}: {
  items: InventoryItem[];
  initialProductId: number;
  onClose: () => void;
  onDone: (item: InventoryItem, quantity: number) => void;
}) {
  const [productId, setProductId] = useState(initialProductId);
  const [quantityText, setQuantityText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());

  const item = items.find((candidate) => candidate.productId === productId);
  const quantity = Number(quantityText);
  const valid = quantityText.trim() !== "" && Number.isInteger(quantity) && quantity >= 1 && quantity <= 10_000;

  function changeInput(change: () => void) {
    // 내용이 바뀌면 다른 입고이므로 새 멱등 키를 쓴다. 같은 내용 재시도는 같은 키로 한 번만 반영된다.
    change();
    idempotencyKey.current = crypto.randomUUID();
    setError(null);
  }

  async function submit() {
    if (!valid || item === undefined) return;
    setPending(true);
    setError(null);
    try {
      const response = await callApi("registerInbound", {
        params: { productId },
        body: { idempotencyKey: idempotencyKey.current, quantity },
      });
      onDone(response.item, quantity);
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "입고를 등록하지 못했어요. 다시 시도해 주세요.");
      setPending(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="inbound-title" className="fixed inset-0 z-50">
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-scrim" />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-110 flex-col bg-ground p-6">
        <div className="flex items-center justify-between">
          <h2 id="inbound-title" className="text-2xl leading-9 font-extrabold text-ink">
            입고 등록
          </h2>
          <button type="button" aria-label="닫기" onClick={onClose} className="flex size-8 items-center justify-center">
            <Icon name="close" />
          </button>
        </div>
        <div className="mt-6">
          <label htmlFor="inbound-product" className="text-xs-plus font-bold text-ink">
            상품
          </label>
          <select
            id="inbound-product"
            value={productId}
            onChange={(event) => {
              changeInput(() => {
                setProductId(Number(event.target.value));
              });
            }}
            className="mt-2 h-12 w-full rounded-md border border-ink-3 bg-ground px-3 text-base text-ink"
          >
            {items.map((candidate) => (
              <option key={candidate.productId} value={candidate.productId}>
                {candidate.productName}
              </option>
            ))}
          </select>
          {item !== undefined && <p className="mt-1.5 text-xs-plus text-ink-3">현재 재고 {item.quantity}개</p>}
        </div>
        <div className="mt-5">
          <label htmlFor="inbound-quantity" className="text-xs-plus font-bold text-ink">
            입고 수량
          </label>
          <div className="mt-2 flex h-12 items-center rounded-md border-2 border-ink px-3 focus-within:outline-3 focus-within:outline-accent">
            <input
              id="inbound-quantity"
              type="number"
              inputMode="numeric"
              min={1}
              max={10000}
              value={quantityText}
              onChange={(event) => {
                changeInput(() => {
                  setQuantityText(event.target.value);
                });
              }}
              className="min-w-0 flex-1 bg-transparent text-base font-bold text-ink outline-none"
            />
            <span className="text-sm text-ink-3">개</span>
          </div>
        </div>
        {item !== undefined && valid && (
          <div className="mt-5 flex items-center justify-between rounded-sm bg-canvas px-4 py-4">
            <span className="text-xs-plus text-ink-2">등록 후 재고</span>
            <span className="text-2xl leading-8 font-extrabold text-ink">{item.quantity + quantity}개</span>
          </div>
        )}
        {error !== null && (
          <p role="alert" className="mt-4 rounded-sm bg-danger-soft px-3 py-2 text-xs-plus font-semibold text-danger">
            {error}
          </p>
        )}
        <div className="mt-auto flex gap-2 pt-6">
          <Button variant="secondary" size="lg" onClick={onClose}>
            취소
          </Button>
          <Button size="lg" className="flex-1" disabled={!valid || pending} onClick={() => void submit()}>
            {pending ? "등록하는 중" : error !== null ? "다시 시도" : "입고 등록"}
          </Button>
        </div>
      </div>
    </div>
  );
}
