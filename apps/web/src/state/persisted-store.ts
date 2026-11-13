/**
 * 브라우저 localStorage에 JSON으로 저장하는 작은 외부 저장소. useSyncExternalStore와 함께 쓴다.
 * 저장된 값이 형식과 다르면(직접 고쳤거나 옛 형식) 경고를 남기고 비운다. 다른 탭에서 바뀌면 storage 이벤트로 다시 읽는다.
 */
export interface PersistedStore<T> {
  get: () => T;
  set: (next: T) => void;
  subscribe: (listener: () => void) => () => void;
  /** 저장된 값을 다시 읽는다(테스트나 다른 탭의 변경 뒤) */
  reload: () => void;
}

export function createPersistedStore<T>(key: string, parse: (raw: unknown) => T, empty: T): PersistedStore<T> {
  let snapshot: T | undefined;
  const listeners = new Set<() => void>();

  function notify() {
    for (const listener of listeners) listener();
  }

  function get(): T {
    if (snapshot !== undefined) return snapshot;
    try {
      const raw = localStorage.getItem(key);
      snapshot = raw === null ? empty : parse(JSON.parse(raw));
    } catch (error) {
      console.warn(`저장된 값(${key})을 읽지 못해 비웁니다`, error);
      snapshot = empty;
    }
    return snapshot;
  }

  function set(next: T) {
    snapshot = next;
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch (error) {
      console.warn(`값(${key})을 브라우저에 저장하지 못했습니다`, error);
    }
    notify();
  }

  function reload() {
    snapshot = undefined;
    notify();
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    if (listeners.size === 1) window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) window.removeEventListener("storage", onStorage);
    };
  }

  function onStorage(event: StorageEvent) {
    if (event.key === key || event.key === null) reload();
  }

  return { get, set, subscribe, reload };
}
