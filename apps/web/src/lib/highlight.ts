export interface TextPart {
  text: string;
  match: boolean;
}

/** text에서 query와 일치하는 곳(대소문자 무시)을 모두 나눠 돌려준다. query가 비면 전체가 한 덩어리다. */
export function splitByQuery(text: string, query: string): TextPart[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [{ text, match: false }];

  const haystack = text.toLowerCase();
  const parts: TextPart[] = [];
  let cursor = 0;
  for (;;) {
    const found = haystack.indexOf(needle, cursor);
    if (found === -1) break;
    if (found > cursor) parts.push({ text: text.slice(cursor, found), match: false });
    parts.push({ text: text.slice(found, found + needle.length), match: true });
    cursor = found + needle.length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
  return parts.length === 0 ? [{ text, match: false }] : parts;
}
