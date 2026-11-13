export class NotReadOnlyError extends Error {
  constructor(reason: string) {
    super(`읽기 전용 서버입니다. SELECT 문 하나만 보낼 수 있습니다 (${reason})`);
    this.name = "NotReadOnlyError";
  }
}

/**
 * 보낸 SQL이 SELECT(또는 WITH로 시작하는 조회) 한 문장인지 검사한다. 문자열·따옴표 이름·주석 안의 글자는 건너뛴다.
 * 이 검사가 놓쳐도 DB 연결이 읽기 전용이라 쓰기는 어차피 실패한다(이중 방어).
 */
export function assertReadOnlySelect(sql: string): void {
  let keyword = "";
  let sawStatementEnd = false;
  for (let index = 0; index < sql.length; index++) {
    const char = sql.charAt(index);
    const next = sql.charAt(index + 1);
    if (char === "-" && next === "-") {
      const end = sql.indexOf("\n", index);
      index = end === -1 ? sql.length : end;
    } else if (char === "/" && next === "*") {
      const end = sql.indexOf("*/", index + 2);
      if (end === -1) throw new NotReadOnlyError("닫히지 않은 주석");
      index = end + 1;
    } else if (char === "'" || char === '"' || char === "`" || char === "[") {
      const close = char === "[" ? "]" : char;
      let end = index + 1;
      while (end < sql.length && !(sql.charAt(end) === close && sql.charAt(end + 1) !== close)) end += sql.charAt(end) === close ? 2 : 1;
      if (end >= sql.length) throw new NotReadOnlyError("닫히지 않은 따옴표");
      index = end;
      if (keyword === "") throw new NotReadOnlyError("SELECT로 시작해야 합니다");
    } else if (char === ";") {
      sawStatementEnd = true;
    } else if (!/\s/.test(char)) {
      if (sawStatementEnd) throw new NotReadOnlyError("문장이 둘 이상입니다");
      if (keyword === "") {
        const word = /^[A-Za-z]+/.exec(sql.slice(index))?.[0] ?? "";
        keyword = word.toUpperCase();
        if (keyword !== "SELECT" && keyword !== "WITH") throw new NotReadOnlyError("SELECT로 시작해야 합니다");
        index += word.length - 1;
      }
    }
  }
  if (keyword === "") throw new NotReadOnlyError("빈 문장입니다");
}
