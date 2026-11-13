# apps/web 지침

React 19 + Vite + Tailwind 웹입니다. 고객 화면과 관리자 화면이 한 앱에 있습니다.

## 구조

- `src/routes`: 화면 하나당 파일 하나(loader와 페이지). 경로 표는 `src/router.tsx`.
- `src/components`: 여러 화면이 쓰는 조각(버튼, 상태 표시, 요약 상자 등).
- `src/api/client.ts`: API는 `callApi("엔드포인트키", 입력)`으로만 부릅니다. `fetch`를 직접 쓰지 않습니다.
- `src/state`, `src/lib`: 장바구니·최근 검색어 같은 브라우저 상태와 순수 함수.

## 지킬 것

- 색·간격·모서리·글자 크기는 `src/styles.css`의 디자인 토큰에서만 옵니다. 색 값(#fff 등)이나 임의 값(`w-[13px]`)을 쓰지 않습니다.
- 요청·응답 타입은 `@grabmarket/contracts`에서 가져옵니다. 화면에서 같은 타입을 다시 정의하지 않습니다.
- 금액 규칙(배송비 등)은 서버 한 곳에만 있고 화면은 응답을 그대로 보입니다. 화면에서 금액을 계산하지 않습니다.
- 모든 화면은 불러오는 중·비어 있음·실패(다시 시도)를 `components/states.tsx`로 보입니다.
- 화면 글자는 짧은 존댓말 한국어입니다. 데이터에 없는 값(별점·리뷰 수·할인율)은 그리지 않습니다.

## 확인

`npm run verify`. 화면 동작은 `happy-dom` 컴포넌트 테스트(`src/test/render-app.tsx`, `fake-api.ts`)로 확인합니다.
