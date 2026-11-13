// 갈라진 세션 찾기.
// /branch와 `claude --resume <id> --fork-session`은 원본 세션의 대화 줄을 uuid 그대로 새 세션 파일에 복사한다.
// 그래서 두 세션이 같은 uuid를 가지면 한쪽이 다른 쪽에서 갈라진 것이다.
// - /branch는 복사한 줄에 forkedFrom.sessionId를 남기므로 원본이 바로 정해진다.
// - --fork-session은 표시를 남기지 않는다. 복사한 줄은 원본 시각을 그대로 갖고, 새 세션 자신의 줄(대기열 기록 등)은
//   갈라진 뒤에 생긴다. 그래서 "공유하지 않는 줄 중 가장 이른 시각"이 늦은 쪽을 갈라진 세션으로 본다.
import type { Request, SessionTranscript } from "./transcript.ts";

export type BranchKind = "branch" | "fork";

export interface BranchLink {
  parentId: string;
  kind: BranchKind;
  /** 두 세션이 같은 요청 수(요청 1부터 이 번호까지 같다). */
  sharedRequests: number;
}

function countSharedRequests(parent: readonly Request[], child: readonly Request[]): number {
  const parentIds = new Set(parent.map((request) => request.messageId));
  let shared = 0;
  for (const request of child) {
    if (!parentIds.has(request.messageId)) break;
    shared += 1;
  }
  return shared;
}

export interface BranchInput {
  id: string;
  transcript: SessionTranscript;
}

function earliestUnshared(input: BranchInput, shared: ReadonlySet<string>): string | null {
  let earliest: string | null = null;
  for (const { uuid, timestamp } of input.transcript.stamps) {
    if (uuid !== null && shared.has(uuid)) continue;
    if (earliest === null || timestamp < earliest) earliest = timestamp;
  }
  return earliest;
}

/** 세션마다 어느 세션에서 갈라졌는지 찾는다. 갈라지지 않은 세션은 결과에 없다. */
export function findBranches(inputs: readonly BranchInput[]): Map<string, BranchLink> {
  const byId = new Map(inputs.map((input) => [input.id, input]));
  const uuidSets = new Map(inputs.map((input) => [input.id, new Set(input.transcript.uuids)]));
  const links = new Map<string, BranchLink>();

  for (const child of inputs) {
    const explicit = child.transcript.forkedFromSessionId;
    if (explicit !== null && explicit !== child.id) {
      const parent = byId.get(explicit);
      if (parent !== undefined) {
        links.set(child.id, { parentId: explicit, kind: "branch", sharedRequests: countSharedRequests(parent.transcript.requests, child.transcript.requests) });
      }
      continue;
    }
    const childUuids = uuidSets.get(child.id) ?? new Set<string>();
    let best: { parent: BranchInput; sharedUuids: number } | null = null;
    for (const candidate of inputs) {
      if (candidate.id === child.id) continue;
      const candidateUuids = uuidSets.get(candidate.id) ?? new Set<string>();
      const shared = new Set([...childUuids].filter((uuid) => candidateUuids.has(uuid)));
      if (shared.size === 0) continue;
      const childOwn = earliestUnshared(child, shared);
      const candidateOwn = earliestUnshared(candidate, shared);
      // 후보가 먼저 시작했어야 원본이다. 후보에 자기 줄이 없으면 복사만 받은 쪽이 아니라 원본 그대로다.
      const candidateIsOlder = childOwn !== null && (candidateOwn === null || candidateOwn < childOwn);
      if (!candidateIsOlder) continue;
      if (best === null || shared.size > best.sharedUuids) best = { parent: candidate, sharedUuids: shared.size };
    }
    if (best !== null) {
      links.set(child.id, { parentId: best.parent.id, kind: "fork", sharedRequests: countSharedRequests(best.parent.transcript.requests, child.transcript.requests) });
    }
  }
  return links;
}

export interface Comparison {
  parentId: string;
  childId: string;
  kind: BranchKind;
  sharedRequests: number;
  parentRest: Request[];
  childRest: Request[];
}

export function compareBranch(link: BranchLink, childId: string, parent: SessionTranscript, child: SessionTranscript): Comparison {
  return {
    parentId: link.parentId,
    childId,
    kind: link.kind,
    sharedRequests: link.sharedRequests,
    parentRest: parent.requests.slice(link.sharedRequests),
    childRest: child.requests.slice(link.sharedRequests),
  };
}
