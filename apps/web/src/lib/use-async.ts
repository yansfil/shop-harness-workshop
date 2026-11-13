import { useEffect, useEffectEvent, useState } from "react";

export type AsyncState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "ready"; data: T };

interface Settled<T> {
  key: string;
  result: { ok: true; data: T } | { ok: false; error: unknown };
}

/**
 * key가 바뀔 때마다(delayMs만큼 기다린 뒤) load를 한 번 부르고, 늦게 도착한 옛 응답은 버린다.
 * key가 null이면 아무것도 부르지 않는다(idle). 같은 key를 다시 부르려면 key에 시도 번호를 넣는다.
 */
export function useAsync<T>(key: string | null, load: () => Promise<T>, delayMs = 0): AsyncState<T> {
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const run = useEffectEvent(load);

  useEffect(() => {
    if (key === null) return;
    let stale = false;
    const timer = setTimeout(() => {
      run().then(
        (data) => {
          if (!stale) setSettled({ key, result: { ok: true, data } });
        },
        (error: unknown) => {
          console.warn("불러오지 못했습니다", error);
          if (!stale) setSettled({ key, result: { ok: false, error } });
        },
      );
    }, delayMs);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [key, delayMs]);

  if (key === null) return { status: "idle" };
  if (settled?.key !== key) return { status: "loading" };
  return settled.result.ok ? { status: "ready", data: settled.result.data } : { status: "error", error: settled.result.error };
}
