---
name: reset-seed
description: 그랩마켓 DB를 지우고 시드로 다시 채운다(npm run db:reset). 사용자가 DB 초기화·시드 재생성을 요청할 때만 쓰고, 사용자의 확인을 받은 뒤에만 실행한다.
disable-model-invocation: true
allowed-tools: Bash(npm run db:reset)
---

# DB 초기화

`npm run db:reset`은 DB의 모든 데이터를 지우고 시드로 다시 채운다. 되돌릴 수 없다.

1. 먼저 사용자에게 알린다: "DB의 모든 데이터를 지우고 시드로 다시 채웁니다. 계속할까요?"
2. 사용자가 이번 대화에서 명확하게 "예"라고 답하기 전에는 `npm run db:reset`을 실행하지 않는다. 처음 요청만으로는 확인이 아니다. 답이 없거나 애매하면 실행하지 않는다.
3. 확인을 받으면 `npm run db:reset`을 한 번 실행하고, 출력의 행 수와 시드 해시를 알려 준다.
