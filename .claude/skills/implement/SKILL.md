---
name: implement
description: 확정된 PRD(docs/tasks/<slug>.md)를 조사·계획·구현하고 verify와 독립 검증까지 마친다. PRD 구현, 확정 문서 기반 개발 요청에 쓴다.
argument-hint: "docs/tasks/<slug>.md"
---

PRD: $ARGUMENTS

## 준비

1. PRD, 루트 `CLAUDE.md`, 건드릴 영역의 하위 `CLAUDE.md`와 `docs/rules/`를 읽습니다.
   `확정 여부`가 초안이거나 미해결 질문이 남았으면 구현하지 않고 `prd` Skill로 돌아갑니다.
2. 관련 코드·테스트를 조사하고 `git status`로 다른 변경이 섞이지 않았는지 봅니다.
3. `references/plan-template.md`로 계획을 `docs/tasks/<slug>.plan.md`에 씁니다.
   AC마다 어떤 파일을 바꾸고 어떤 테스트로 확인할지 적고, 계획이 PRD 범위를 넘지 않는지 대조합니다.

## 구현

4. PRD 범위 안에서만 구현합니다. 계층 규칙과 고유 규칙 8개를 지킵니다.
   새 동작은 새 테스트로 적습니다. 기존 테스트의 기대값은 바꾸지 않습니다.
   스키마 변경은 새 번호 마이그레이션으로 합니다.
5. `npm run verify`를 돌려 통과시키고 `npm run grade`로 규칙 위반이 없는지 봅니다.
6. `verifier` 서브에이전트에게 PRD 경로와 변경 범위를 넘겨 독립 검증을 맡깁니다.
   예상 PASS나 "테스트가 통과했다"는 요약을 정답으로 주지 않습니다. 검증자가 직접 읽고 직접 실행합니다.
7. FAIL이면 소스를 고치고 verify를 다시 돌린 뒤 새 검증을 요청합니다. 검증 결과를 구현자가 바꾸지 않습니다.

## 끝내기

- 마지막 수정 뒤에 통과한 `npm run verify`와 verifier의 PASS를 확인한 뒤에 끝났다고 말합니다.
- 결과, 바꾼 파일, 실행한 검증, 남은 한계를 보고합니다.
- 계획 파일 말고 PRD는 고치지 않습니다. PRD가 틀렸다면 사람에게 알리고 `prd` Skill로 돌아갑니다.
