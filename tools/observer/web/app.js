// 세션 뷰어 화면. 빌드 없이 브라우저가 바로 읽는다.
// 서버(tools/observer/src/server.ts)의 JSON API를 읽고, /events(SSE)로 기록이 바뀌었다는 알림을 받으면 그 부분만 다시 읽는다.
// --export로 만든 파일에서는 window.OBSERVER_SNAPSHOT에 미리 담긴 자료를 쓴다.
/* global window, document, fetch, EventSource */

const snapshot = window.OBSERVER_SNAPSHOT ?? null;
const app = document.getElementById("app");
const live = document.getElementById("live");

const REASONS = {
  session_start: "세션 시작",
  nested_traversal: "하위 폴더 진입",
  path_glob_match: "경로 규칙 일치",
  include: "@ 가져오기",
  compact: "압축 뒤 다시 읽음",
};
const VIOLATION_PAGE = 100;

const state = {
  tab: "session",
  sessions: null,
  configDir: "",
  selectedId: null,
  /** 사람이 세션을 고르기 전에는 가장 최근 세션을 따라간다. */
  followLatest: true,
  detail: null,
  compare: null,
  parentDetail: null,
  selectedRequest: null,
  instructions: null,
  grade: null,
  gradeAll: false,
  gradeLoading: false,
  showAllViolations: false,
  loadError: null,
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

async function api(path) {
  if (snapshot !== null) {
    if (path in snapshot.responses) return snapshot.responses[path];
    throw new Error("내보낸 기록에 없는 자료예요");
  }
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} ${response.status}`);
  return response.json();
}

const shortId = (id) => id.slice(0, 6);
const pad = (n) => String(n).padStart(2, "0");
function clock(iso) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function day(iso) {
  const d = new Date(iso);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function tokens(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
function seconds(ms) {
  return ms === null ? "" : `${(ms / 1000).toFixed(1)}초`;
}
function toolNames(request) {
  if (request === undefined) return "없음";
  if (request.tools.length === 0) return "도구 없음";
  const counts = new Map();
  for (const tool of request.tools) counts.set(tool.name, (counts.get(tool.name) ?? 0) + 1);
  return [...counts].map(([name, count]) => (count > 1 ? `${name} ×${count}` : name)).join(" · ");
}

// ── 자료 읽기 ─────────────────────────────────────────

async function loadSessions() {
  const body = await api("/api/sessions");
  state.sessions = body.sessions;
  state.configDir = body.configDir;
  const ids = new Set(state.sessions.map((session) => session.id));
  if (state.selectedId !== null && !ids.has(state.selectedId)) {
    state.selectedId = null;
    state.followLatest = true;
  }
  if (state.followLatest) state.selectedId = state.sessions[0]?.id ?? null;
}

async function loadSelected() {
  state.detail = null;
  state.compare = null;
  state.parentDetail = null;
  state.instructions = null;
  const id = state.selectedId;
  if (id === null) return;
  const summary = state.sessions.find((session) => session.id === id);
  const [detail, instructions, compare] = await Promise.all([
    api(`/api/sessions/${id}`),
    api(`/api/sessions/${id}/instructions`),
    summary?.branch ? api(`/api/sessions/${id}/compare`) : Promise.resolve(null),
  ]);
  if (state.selectedId !== id) return;
  state.detail = detail;
  state.instructions = instructions;
  state.compare = compare;
  const last = detail.requests.at(-1);
  if (state.selectedRequest === null || !detail.requests.some((request) => request.index === state.selectedRequest) || state.followLatest) {
    state.selectedRequest = last?.index ?? null;
  }
}

async function loadGrade() {
  if (snapshot !== null) return;
  state.gradeLoading = true;
  render();
  try {
    state.grade = await api(`/api/grade${state.gradeAll ? "?all=1" : ""}`);
  } catch (error) {
    state.grade = { status: "error", message: `채점 결과를 받지 못했어요. 뷰어 터미널을 확인하세요. (${error.message})` };
  }
  state.gradeLoading = false;
  render();
}

async function refreshAll() {
  try {
    await loadSessions();
    await loadSelected();
    state.loadError = null;
  } catch (error) {
    state.loadError = error.message;
  }
  render();
}

// ── 세션 탭 ───────────────────────────────────────────

function emptySessions() {
  return `<section class="panel empty">
    <h2>아직 세션이 없어요</h2>
    <p>실습 설정 폴더에서 이 레포의 세션 기록을 찾지 못했어요. 아래 명령으로 Claude Code를 띄우면 요청이 생기는 대로 여기에 나타나요.</p>
    <code class="command">node start.mjs</code>
    <div class="actions"><span class="muted mono">찾는 곳 · ${escapeHtml(state.configDir)}</span></div>
  </section>`;
}

function sessionList() {
  const children = new Map();
  for (const session of state.sessions) {
    if (session.branch === null) continue;
    const list = children.get(session.branch.parentId) ?? [];
    list.push(session);
    children.set(session.branch.parentId, list);
  }
  const known = new Set(state.sessions.map((session) => session.id));
  const item = (session, depth) => {
    const branchTag = session.branch === null ? "" : `<span class="badge tag">${session.branch.kind === "branch" ? "/branch" : "fork"}</span>`;
    const parentTag = children.has(session.id) ? '<span class="badge tag">원본</span>' : "";
    const fork = session.branch === null ? "" : `<span class="meta">요청 ${session.branch.sharedRequests} 뒤에서 갈라짐</span>`;
    const unreadable = session.unreadableCount > 0 ? ` · <span class="badge warn">읽지 못한 줄 ${session.unreadableCount}</span>` : "";
    const rows = [
      `<li><button type="button" class="session-item${depth > 0 ? " child" : ""}" data-session="${escapeHtml(session.id)}" aria-current="${session.id === state.selectedId}">
        <span class="id">${escapeHtml(shortId(session.id))}</span>${parentTag}${branchTag}
        <span class="meta">${session.startedAt ? day(session.startedAt) : "시각 없음"} · 요청 ${session.requestCount}${unreadable}</span>${fork}
      </button></li>`,
    ];
    for (const child of children.get(session.id) ?? []) rows.push(item(child, depth + 1));
    return rows.join("");
  };
  const roots = state.sessions.filter((session) => session.branch === null || !known.has(session.branch.parentId));
  return `<ul class="panel sessions">${roots.map((session) => item(session, 0)).join("")}</ul>`;
}

function bar(request, max) {
  const scale = (n) => `${(n / max) * 100}%`;
  const t = request.tokens;
  return `<div class="bar" title="새 입력 ${t.input} · 캐시 쓰기 ${t.cacheWrite} · 캐시 읽기 ${t.cacheRead} · 출력 ${t.output}" style="width:${scale(request.total)}">
    <span class="input" style="flex:${t.input}"></span><span class="cache-write" style="flex:${t.cacheWrite}"></span><span class="cache-read" style="flex:${t.cacheRead}"></span><span class="output" style="flex:${t.output}"></span>
  </div>`;
}

const LEGEND = `<div class="legend end">
  <span><i style="background:var(--bar-input)"></i>새 입력</span>
  <span><i style="background:var(--bar-cache-write)"></i>캐시 쓰기</span>
  <span><i style="background:var(--bar-cache-read)"></i>캐시 읽기</span>
  <span><i style="background:var(--bar-output);outline:1px solid var(--color-ink);outline-offset:-1px"></i>출력</span>
</div>`;

function requestRow(request, max, selectable) {
  const selected = selectable && request.index === state.selectedRequest;
  return `<tr class="request" data-request="${request.index}" aria-selected="${selected}">
    <td class="col-index num">${request.index}</td>
    <td class="col-time num">${clock(request.at)}</td>
    <td>${bar(request, max)}</td>
    <td class="col-total right num">${tokens(request.total)}</td>
    <td class="tools-cell">${escapeHtml(toolNames(request))}</td>
  </tr>`;
}

function requestTable(detail) {
  const max = Math.max(1, ...detail.requests.map((request) => request.total));
  const gapsAfter = new Map();
  for (const problem of detail.unreadable) {
    const list = gapsAfter.get(problem.afterRequest) ?? [];
    list.push(problem.line);
    gapsAfter.set(problem.afterRequest, list);
  }
  const gapRow = (after) => {
    const lines = gapsAfter.get(after);
    if (lines === undefined) return "";
    return `<tr class="gap"><td colspan="5">줄 ${lines.join(" · ")} 읽지 못했어요 · 이 줄의 토큰은 합계에 없어요</td></tr>`;
  };
  const rows = [gapRow(0)];
  for (const request of detail.requests) rows.push(requestRow(request, max, true), gapRow(request.index));
  const body = detail.requests.length === 0 ? '<tr class="missing"><td colspan="5">아직 요청이 없어요. Claude Code에 첫 요청을 보내면 여기에 나타나요.</td></tr>' : rows.join("");
  return `<table class="panel">
    <thead><tr><th>#</th><th>시각</th><th>토큰</th><th class="right">합계</th><th>도구 호출</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function toolFlow(detail) {
  const request = detail.requests.find((candidate) => candidate.index === state.selectedRequest);
  if (request === undefined) return "";
  const running = request.tools.some((tool) => tool.status === "running");
  const items = request.tools
    .map(
      (tool) => `<li data-status="${tool.status}">
        <span class="name">${escapeHtml(tool.name)}</span>
        <span class="took num">${tool.status === "running" ? "진행 중" : tool.status === "error" ? `실패 · ${seconds(tool.durationMs)}` : seconds(tool.durationMs)}</span>
        <span class="what">${escapeHtml(tool.summary)}</span>
      </li>`,
    )
    .join("");
  return `<section class="panel">
    <div class="side-head"><span>요청 ${request.index} · 도구 호출 흐름</span>${running ? '<span class="badge running">진행 중</span>' : ""}</div>
    ${request.tools.length === 0 ? '<p class="side-empty">이 요청은 도구를 부르지 않았어요.</p>' : `<ol class="flow">${items}</ol>`}
  </section>`;
}

function unreadablePanel(detail) {
  if (detail.unreadable.length === 0) return "";
  const items = detail.unreadable
    .map(
      (problem) => `<li><span class="where num">${problem.line}</span><strong>${problem.afterRequest === 0 ? "첫 요청 전" : `요청 ${problem.afterRequest} 뒤`}</strong>
        <span class="why">${escapeHtml(problem.reason)}</span></li>`,
    )
    .join("");
  return `<section class="panel">
    <div class="side-head"><span>읽지 못한 기록 줄 ${detail.unreadable.length}개 <span class="muted">· ${detail.lineCount}줄 중</span></span></div>
    <ul class="problems">${items}</ul>
  </section>`;
}

function sessionView(detail) {
  const warn = detail.unreadable.length > 0 ? `<span class="badge warn">읽지 못한 기록 줄 ${detail.unreadable.length}개</span>` : "";
  return `<div class="heading"><strong>세션 ${escapeHtml(shortId(detail.id))}</strong>
      <span>${detail.startedAt ? `${day(detail.startedAt)} 시작` : ""} · 요청 ${detail.requests.length}개</span>${warn}${LEGEND}</div>
    <div class="with-side">${requestTable(detail)}<div class="side">${toolFlow(detail)}${unreadablePanel(detail)}</div></div>`;
}

function compareCard(id, label, rest, compare, max) {
  const rows = [];
  if (compare.sharedRequests > 0) rows.push(`<tr class="same"><td colspan="4">요청 1–${compare.sharedRequests} 두 세션이 같아요</td></tr>`);
  const length = Math.max(compare.parentRest.length, compare.childRest.length);
  for (let i = 0; i < length; i += 1) {
    const request = rest[i];
    const index = compare.sharedRequests + i + 1;
    if (request === undefined) rows.push(`<tr class="missing"><td colspan="4">요청 ${index} 없음</td></tr>`);
    else
      rows.push(`<tr class="request" aria-selected="${i === 0}"><td class="col-index num">${request.index}</td><td class="col-time num">${clock(request.at)}</td><td>${bar(request, max)}</td><td class="col-total right num">${tokens(request.total)}</td></tr>`);
  }
  if (length === 0) rows.push('<tr class="missing"><td colspan="4">갈라진 뒤 요청이 아직 없어요</td></tr>');
  return `<section class="panel"><div class="card-head">${escapeHtml(shortId(id))} <span class="badge tag">${label}</span></div><table><tbody>${rows.join("")}</tbody></table></section>`;
}

function compareView(compare) {
  const all = [...compare.parentRest, ...compare.childRest];
  const max = Math.max(1, ...all.map((request) => request.total));
  const first = compare.sharedRequests + 1;
  const kind = compare.kind === "branch" ? "/branch" : "fork";
  const diff =
    compare.parentRest.length === 0 && compare.childRest.length === 0
      ? "갈라진 뒤 두 세션 모두 요청이 아직 없어요"
      : `요청 ${first}에서 처음 달라졌어요 · 원본은 ${escapeHtml(toolNames(compare.parentRest[0]))}, 분기는 ${escapeHtml(toolNames(compare.childRest[0]))}`;
  return `<div class="heading"><strong>${escapeHtml(shortId(compare.parentId))} 와 ${escapeHtml(shortId(compare.childId))} 비교</strong><span>· 갈라진 지점부터</span></div>
    <div class="compare">${compareCard(compare.parentId, "원본", compare.parentRest, compare, max)}${compareCard(compare.childId, kind, compare.childRest, compare, max)}</div>
    <p class="first-diff">${diff}</p>`;
}

function sessionTab() {
  if (state.sessions.length === 0) return emptySessions();
  let main = "";
  if (state.compare !== null) main = compareView(state.compare);
  else if (state.detail !== null) main = sessionView(state.detail);
  return `<div class="split">${sessionList()}<div>${main}</div></div>`;
}

// ── 지침 지도 탭 ──────────────────────────────────────

function noInstructionLog() {
  return `<section class="panel empty">
    <h2>지침 읽기 기록이 없어요</h2>
    <p>이 세션은 start.mjs로 띄우지 않아서 어떤 지침이 읽혔는지 알 수 없어요. 아래 명령으로 다시 시작해 주세요.</p>
    <code class="command">node start.mjs</code>
  </section>`;
}

function buildTree(files) {
  const root = { name: "", folders: new Map(), files: [] };
  for (const file of files) {
    const parts = file.path.split("/");
    const name = parts.pop();
    let node = root;
    for (const part of parts) {
      if (!node.folders.has(part)) node.folders.set(part, { name: part, folders: new Map(), files: [] });
      node = node.folders.get(part);
    }
    node.files.push({ ...file, name });
  }
  return root;
}

function instructionRows(node, depth) {
  const rows = [];
  const indent = (d) => `style="padding-left:${16 + d * 24}px"`;
  for (const file of node.files) {
    const load = file.loads[0];
    const more = file.loads.length > 1 ? ` <span class="muted">외 ${file.loads.length - 1}번</span>` : "";
    const when = load === undefined ? "" : `${load.afterRequest === 0 ? "시작할 때" : `요청 ${load.afterRequest} 뒤`} · ${clock(load.at)}${more}`;
    const why = load === undefined ? "" : `<div class="reason"><strong>${escapeHtml(REASONS[load.reason] ?? "알 수 없는 이유")}</strong><code>${escapeHtml(load.reason)}</code></div>`;
    rows.push(`<tr class="file${load === undefined ? " unread" : ""}">
      <td ${indent(depth)}><span class="icon"></span>${escapeHtml(file.name)}</td>
      <td>${load === undefined ? '<span class="badge unread">안 읽힘</span>' : '<span class="badge read">읽힘</span>'}</td>
      <td class="num">${when}</td>
      <td>${why}</td>
      <td class="mono">${load?.trigger ? escapeHtml(load.trigger) : load === undefined ? "" : "없음"}</td>
    </tr>`);
  }
  for (const folder of [...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    rows.push(`<tr class="folder"><td colspan="5" ${indent(depth)}><span class="icon"></span>${escapeHtml(folder.name)}/</td></tr>`);
    rows.push(...instructionRows(folder, depth + 1));
  }
  return rows;
}

function instructionsTab() {
  if (state.sessions.length === 0) return emptySessions();
  const map = state.instructions;
  if (map === null || state.detail === null) return "";
  if (map.status === "missing") return noInstructionLog();
  const inside = map.files.filter((file) => file.insideRepo);
  const outside = map.files.filter((file) => !file.insideRepo);
  const loaded = map.files.filter((file) => file.loads.length > 0).length;
  const warn = map.unreadable.length > 0 ? `<span class="badge warn" title="${escapeHtml(map.unreadable.map((p) => `줄 ${p.line}: ${p.reason}`).join("\n"))}">읽지 못한 기록 줄 ${map.unreadable.length}개 (줄 ${map.unreadable.map((p) => p.line).join(", ")})</span>` : "";
  const rows = [`<tr class="folder"><td colspan="5"><span class="icon"></span>${escapeHtml(map.repoName)}/</td></tr>`, ...instructionRows(buildTree(inside), 1)];
  if (outside.length > 0) {
    rows.push('<tr class="folder"><td colspan="5"><span class="icon"></span>레포 밖</td></tr>');
    for (const file of outside) rows.push(...instructionRows({ folders: new Map(), files: [{ ...file, name: file.path }] }, 1));
  }
  return `<div class="heading"><strong>세션 ${escapeHtml(shortId(state.detail.id))}</strong>
      <span>· 읽힌 지침 ${loaded}개 · 읽히지 않은 지침 ${map.files.length - loaded}개</span>${warn}</div>
    <table class="panel tree">
      <thead><tr><th>폴더 · 지침 파일</th><th>상태</th><th>언제</th><th>왜 읽혔나</th><th>어떤 파일 때문에</th></tr></thead>
      <tbody>${rows.join("")}</tbody>
    </table>`;
}

// ── 채점 탭 ───────────────────────────────────────────

function gradeToggle() {
  return `<div class="toggle" role="group" aria-label="채점 범위">
    <button type="button" data-grade-all="0" aria-pressed="${!state.gradeAll}">시작 이후 바뀐 것</button>
    <button type="button" data-grade-all="1" aria-pressed="${state.gradeAll}">전체 (--all)</button>
  </div>`;
}

function gradeTab() {
  if (snapshot !== null) return '<section class="panel empty"><h2>내보낸 기록에는 채점이 없어요</h2><p>채점은 레포에서 npm run grade로 다시 돌려 주세요.</p></section>';
  if (state.grade === null || state.gradeLoading) return `<div class="heading"><span>채점하는 중…</span><span class="end"></span>${gradeToggle()}</div>`;
  if (state.grade.status === "error") {
    return `<div class="heading"><strong>채점할 수 없어요</strong><span class="end"></span>${gradeToggle()}</div>
      <section class="panel empty"><h2>채점할 수 없어요</h2><p>${escapeHtml(state.grade.message)}</p>
      <div class="actions"><button type="button" class="button" data-grade-all="1">전체 (--all)로 채점</button></div></section>`;
  }
  const result = state.grade.result;
  const total = result.violations.length;
  const brokenRules = result.rules.filter((rule) => (rule.count ?? 0) > 0).length;
  const heading =
    result.mode === "all"
      ? `<div class="heading"><span class="grade-big${total === 0 ? " pass" : ""} num">${total}개</span><strong>레포 전체 위반</strong><span>· 파일 ${result.filesChecked}개 검사</span>
          <button type="button" class="link end" data-regrade>다시 채점</button>${gradeToggle()}</div>`
      : `<div class="heading"><strong>위반 ${total}개</strong><span>${total > 0 ? `· 규칙 6개 중 ${brokenRules}개에서 ` : ""}· ${escapeHtml(result.tag)} 이후 바뀐 파일 ${result.filesChecked}개</span>
          <button type="button" class="link end" data-regrade>다시 채점</button>${gradeToggle()}</div>`;
  const rules = result.rules
    .map((rule) => {
      if (rule.count === null) return `<li class="clean"><span class="na">–</span><span class="title">${escapeHtml(rule.title)}</span><span class="note">해당 없음</span></li>`;
      if (rule.count === 0) return `<li class="clean"><span class="ok">✓</span><span class="title">${escapeHtml(rule.title)}</span><span></span></li>`;
      return `<li class="bad"><span class="count num">${rule.count}</span><span class="title">${escapeHtml(rule.title)}</span><span></span></li>`;
    })
    .join("");
  let detail;
  if (total === 0) {
    detail = '<section class="panel pass-panel"><span class="pass-mark">✓</span><div><strong>통과</strong><span class="muted">규칙 6개를 모두 지켰어요</span></div></section>';
  } else {
    const titles = new Map(result.rules.map((rule) => [rule.id, rule.title]));
    const shown = state.showAllViolations ? result.violations : result.violations.slice(0, VIOLATION_PAGE);
    const rows = shown
      .map(
        (v) => `<tr><td><strong>${escapeHtml(titles.get(v.rule) ?? v.rule)}</strong></td><td class="mono">${escapeHtml(v.file)}</td><td class="right num"><strong>${v.line}</strong></td><td>${escapeHtml(v.message)}</td></tr>`,
      )
      .join("");
    const more = result.violations.length > shown.length ? `<button type="button" class="more" data-more>나머지 ${result.violations.length - shown.length}개 더 보기</button>` : "";
    detail = `<section class="panel"><table><thead><tr><th>규칙</th><th>파일</th><th class="right">줄</th><th>무엇이 문제인가</th></tr></thead><tbody>${rows}</tbody></table>${more}</section>`;
  }
  return `${heading}<div class="grade"><ul class="panel rules">${rules}</ul>${detail}</div>`;
}

// ── 그리기와 이벤트 ───────────────────────────────────

function render() {
  for (const tab of document.querySelectorAll(".tab")) tab.setAttribute("aria-current", tab.dataset.tab === state.tab ? "page" : "false");
  if (state.loadError !== null) {
    app.innerHTML = `<section class="panel empty"><h2>기록을 읽지 못했어요</h2><p>${escapeHtml(state.loadError)}</p><p>뷰어 터미널의 오류를 확인하고 npm run viewer를 다시 실행하세요.</p></section>`;
    return;
  }
  if (state.sessions === null) {
    app.innerHTML = '<p class="muted">불러오는 중…</p>';
    return;
  }
  app.innerHTML = state.tab === "session" ? sessionTab() : state.tab === "instructions" ? instructionsTab() : gradeTab();
}

document.addEventListener("click", (event) => {
  const target = event.target instanceof window.Element ? event.target : null;
  if (target === null) return;
  const tab = target.closest("[data-tab]");
  if (tab !== null) {
    state.tab = tab.dataset.tab;
    render();
    if (state.tab === "grade" && state.grade === null) void loadGrade();
    return;
  }
  const session = target.closest("[data-session]");
  if (session !== null) {
    state.selectedId = session.dataset.session;
    state.followLatest = state.selectedId === state.sessions[0]?.id;
    state.selectedRequest = null;
    void loadSelected().then(render);
    return;
  }
  const request = target.closest("[data-request]");
  if (request !== null) {
    state.selectedRequest = Number(request.dataset.request);
    render();
    return;
  }
  const scope = target.closest("[data-grade-all]");
  if (scope !== null) {
    state.gradeAll = scope.dataset.gradeAll === "1";
    state.showAllViolations = false;
    void loadGrade();
    return;
  }
  if (target.closest("[data-regrade]") !== null) {
    void loadGrade();
    return;
  }
  if (target.closest("[data-more]") !== null) {
    state.showAllViolations = true;
    render();
  }
});

function connect() {
  const events = new EventSource("/events");
  events.addEventListener("open", () => {
    live.hidden = false;
    live.dataset.state = "on";
    live.textContent = "실시간";
    void refreshAll();
  });
  events.addEventListener("error", () => {
    live.hidden = false;
    live.dataset.state = "off";
    live.textContent = "연결 끊김 · 뷰어를 다시 실행하세요";
  });
  events.addEventListener("change", (event) => {
    const ids = JSON.parse(event.data).ids;
    void (async () => {
      try {
        await loadSessions();
        if (state.followLatest || ids.includes(state.selectedId)) await loadSelected();
        state.loadError = null;
      } catch (error) {
        state.loadError = error.message;
      }
      render();
    })();
  });
}

render();
if (snapshot === null) connect();
else void refreshAll();
