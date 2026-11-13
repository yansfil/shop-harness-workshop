/**
 * 로더가 기다리지 않고 화면에 넘기는 요청. 화면(Await)이 받아서 실패를 보이므로, 받기 전에 실패해도
 * 처리되지 않은 거절로 새지 않게 막아 둔다. 원래 약속은 그대로라 화면에는 실패가 전달된다.
 */
export function streamed<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => undefined);
  return promise;
}
