# apps/web

React + Vite 웹입니다. 고객 화면과 관리자 화면이 한 앱에 있고 역할별 메뉴로 나뉩니다.

## 스타일

- 색·간격·모서리·글자 크기는 `src/styles.css`의 토큰(Tailwind 클래스 `bg-ink`, `text-ink-2`, `border-line`, `rounded-md` 등)만 쓴다. 헥스 값이나 임의 값(`w-[13px]`)을 쓰지 않는다.
- 모서리 2~4px, 그림자 없이 1px 테두리. 보조색은 `accent` 토큰 하나로만 참조한다.
- 글꼴은 Pretendard이고 `src/assets/fonts`에 있다. CDN에서 불러오지 않는다.

## 화면

- 화면 글자는 짧은 존댓말 한국어("주문을 불러오지 못했어요").
- 데이터에 없는 값(별점, 리뷰 수, 할인율)은 그리지 않는다.
- 모든 화면은 비어 있을 때, 불러오는 중, 실패했을 때를 보인다(`components/states.tsx`, `components/loaded.tsx`). 실패하면 다시 시도할 수 있다.
- 모바일 폭(375px)에서 가로 스크롤이 생기면 안 된다.

## 데이터

- API는 `src/api/client.ts`의 `callApi("엔드포인트이름", ...)`로만 부른다. 응답은 `packages/contracts`의 스키마로 검사한다. `fetch`를 직접 부르지 않는다.
- 요청·응답 타입은 contracts에서 가져온다. 화면에서 같은 모양을 다시 선언하지 않는다.
- 로더는 `streamed(callApi(...))`로 약속을 넘기고 화면은 `Loaded`로 기다린다.
