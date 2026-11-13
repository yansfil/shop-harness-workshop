# 4. 시간은 Clock 주입

현재 시각은 생성자로 주입받은 `Clock`(`@grabmarket/shared`)의 `now()`로만 읽습니다.
`new Date()`를 직접 부르는 곳은 `systemClock` 한 곳뿐입니다.

## 이유

주문 시각·세션 만료·시드 날짜가 실제 시계에 묶이면 테스트 결과가 실행한 날에 따라 달라집니다.
`Clock`을 주입하면 테스트는 `FixedClock`으로 시각을 고정하고, 시드는 고정 기준일로 24명 모두 같은 데이터를 만듭니다.

## 좋은 예

```ts
export class SessionService {
  readonly #clock: Clock;
  constructor(clock: Clock) {
    this.#clock = clock;
  }
  isExpired(session: Session): boolean {
    return session.expiresAt <= this.#clock.now();
  }
}
```

## 나쁜 예

```ts
const createdAt = new Date().toISOString();
if (new Date(session.expiresAt) < new Date()) logout();
```

이렇게 쓰면 테스트가 시간을 고정할 방법이 없습니다.
