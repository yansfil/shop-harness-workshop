function finalConsonant(word: string): number {
  const last = word.charCodeAt(word.length - 1) - 0xac00;
  return last >= 0 && last <= 11171 ? last % 28 : 0;
}

/** "배송준비" → "배송준비로", "배송중" → "배송중으로" (받침이 없거나 ㄹ이면 "로", 아니면 "으로") */
export function withRo(word: string): string {
  const jong = finalConsonant(word);
  return jong === 0 || jong === 8 ? `${word}로` : `${word}으로`;
}

/** "패션" → "패션은", "가구" → "가구는" */
export function withEun(word: string): string {
  return finalConsonant(word) === 0 ? `${word}는` : `${word}은`;
}
