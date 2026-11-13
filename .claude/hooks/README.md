# Hook 판정 범위

이 폴더의 Hook은 공격자를 막는 장치가 아닙니다.
에이전트가 실수로 위험한 일을 하려 할 때 실행 전에 멈추는 안전장치입니다.
그래서 "에이전트가 평소에 쓰는 모양의 명령"을 기준으로 판정합니다.
아래 범위는 `hooks.test.mjs`의 '막는다' 표와 '통과한다' 표로 고정되어 있습니다.

## 막는 것

| Hook | 막는 일 | 예 |
| --- | --- | --- |
| `guard-bash.mjs` | force push | `git push -f`, `git push --force-with-lease`, `git push origin +main` |
| `guard-bash.mjs` | 대량 삭제(빌드 산출물 밖의 재귀 삭제) | `rm -rf apps/api`, `git clean -fd`, `find . -delete` |
| `protect-files.mjs` | `.env` 읽기·쓰기(`.env.example`은 괜찮음) | `cat .env`, `echo X=1 >> .env`, Read·Edit 도구로 `.env` 열기 |
| `protect-files.mjs` | 이미 커밋된 마이그레이션 수정·삭제·이동 | `sed -i ... 0001_init.sql`, `git diff --output=0001_init.sql`, `rm -r packages/db` |
| `stop-verify.mjs` | 코드를 바꾼 뒤 전체 `npm run verify` 없이 끝내기 | `--only`로 일부만 돌린 것, verify 뒤에 다시 고친 것 |
| `lint-saved-file.mjs` | 막지 않음. 저장한 파일의 lint 결과를 돌려줌 | 25초를 넘으면 건너뛰었다고 알림 |

명령을 읽을 때 앞뒤에 붙은 것을 벗겨서 실제로 실행되는 명령을 봅니다.

- 이어 붙인 명령: `;`, `&&`, `||`, `|`, 줄바꿈, `( ... )`, `{ ...; }`, `$( ... )`, 백틱
- 셸에 넘긴 문자열: `bash -c "..."`, `sh -c`, `eval "..."`, 셸이나 node에 넘긴 heredoc
- 실행 접두어와 그 옵션: `VAR=값`, `env`, `command`, `sudo -u x`, `sudo --user x`, `nohup`, `timeout 30`, `xargs`
- git 전역 옵션: `git -C dir`, `git -c k=v`, `git --git-dir x`, `git --work-tree x`
- 작업 폴더: `cd`, `eval "cd ..."`, `git -C dir`, `env -C dir`를 따라가서 상대 경로를 풉니다.
- Windows 경로 구분자(`packages\db\migrations\0001_init.sql`)도 같은 경로로 봅니다.
- 마이그레이션은 "보호 파일이 쓰기 대상으로 나타나는가"로 봅니다.
  쓰기 대상은 출력 리다이렉션(`>`, `>>`), 파일을 쓰는 옵션(`git diff --output=`), 파일을 고치는 명령의 인자(`sed -i`, `cp`의 목적지, `rm`, `mv`), `node -e`·`python -c` 스크립트 안의 파일 경로입니다.
  폴더째 지우거나 옮기는 명령(`rm -r`, `mv`, `git rm -r`)은 그 폴더 안에 커밋된 마이그레이션이 있으면 막습니다.
  `find <폴더> -exec sed -i ... {}`·`find <폴더> -delete`도 그 폴더 아래 `.sql`을 고를 수 있으면 막습니다(`-name '*.ts'`면 통과).

## 허용하는 것 (오탐이 없어야 하는 정상 명령)

| 하는 일 | 예 |
| --- | --- |
| 검증·실행 | `npm run verify`, `npm test`, `npm run dev`, `npx vitest run`, `node scripts/verify.mjs` |
| git 일상 작업 | `git status`, `git diff`, `git add -A`, `git commit -m "..."`, `git push`, `git push -u origin feature`, `git log` |
| 파일 만들기·읽기 | `mkdir -p`, `touch`, `cat`, `rg`, `sed -n` |
| 소스 고치기 | `sed -i '' 's/a/b/' apps/api/src/app.ts`, Edit·Write 도구 |
| 새 마이그레이션 | `mkdir -p packages/db/migrations`, 새 번호 파일(예: `0002_low_stock.sql`) Write 뒤 Edit, `cat > 0002_...sql <<'EOF'`, `cp`로 새 파일 넣기 |
| 빌드 산출물 지우기 | `rm -rf node_modules dist`, 파일 하나 `rm` |
| 기존 마이그레이션 읽기 | `cat`, `git diff -- 0001_init.sql`, `cp 0001_init.sql /tmp/backup.sql` |

새 마이그레이션 판단은 HEAD 기준입니다.
HEAD에 없는 번호 파일은 커밋하기 전까지 고칠 수 있습니다.

## 알려진 한계

아래 모양은 에이전트가 실수로 쓰지 않는 형태라서 일부러 판정하지 않습니다.
막으려면 명령을 실제로 실행해 봐야 하므로, 이 Hook의 목적(실행 전에 멈추기)과 맞지 않습니다.

- 일부러 쪼갠 문자열: `cat .e'nv'`는 잡지만 `F=.e; cat ${F}nv`나 `'.e' + 'nv'`처럼 변수·연산으로 만든 경로는 잡지 않습니다.
- 실행해야 알 수 있는 경로: `cd $(cat dir.txt)`, `eval "$CMD"`처럼 변수에 담긴 명령. 작업 폴더를 모르면 파일 이름만으로 마이그레이션인지 봅니다.
- 다른 파일에 적은 내용: `bash script.sh`, `node tools/x.mjs`, `npm run <스크립트>` 안에서 하는 일, `git apply x.patch`·`patch`가 고칠 파일, `xargs`가 파일 목록에서 읽을 경로는 보지 않습니다.
- 스크립트 안에서 폴더째 지우기·옮기기: `node -e "fs.rmSync('packages/db/migrations', ...)"`. 스크립트 안은 파일 경로만 봅니다(`fs.mkdirSync`로 폴더를 만드는 정상 명령과 구별할 수 없어서).
- 폴더를 통째로 다시 쓰는 도구: `npx prettier --write packages/db/migrations` 같은 형태. 폴더 인자는 지우기·옮기기 명령에서만 봅니다.
- 드문 쓰기 방법: `sed` 스크립트의 `w` 명령, `less -o` 같은 출력 옵션.
- `.env` 읽기 차단은 경로 이름 기준입니다. 심볼릭 링크나 다른 이름으로 복사한 파일은 따라가지 않습니다.

Stop Hook은 한 번 막은 뒤에도 그대로 끝내려 하면 경고만 남기고 끝내게 둡니다.
계속 막으면 끝내기가 끝없이 반복되기 때문입니다.
