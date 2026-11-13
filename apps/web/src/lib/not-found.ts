/** 주소가 가리키는 대상이 없을 때 로더가 던진다. 화면 맨 위 오류 화면이 "페이지를 찾을 수 없어요"로 보인다. */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}
