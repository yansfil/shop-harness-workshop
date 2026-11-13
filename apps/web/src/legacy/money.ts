// 금액 글자 도우미

/** 예전 데이터 금액(정산 소수·조정 차감 포함): -15000 → "-15,000원" */
export function wonText(value: number): string {
  return (value < 0 ? "-" : "") + Math.abs(Math.round(value)).toLocaleString("ko-KR") + "원";
}

/** 부호를 붙인 금액: 5000 → "+5,000원", -5000 → "-5,000원" */
export function signedKrw(value: number): string {
  if (value > 0) return "+" + wonText(value);
  if (value < 0) return "-" + wonText(-value);
  return wonText(0);
}

export function pointText(value: number): string {
  return Math.round(value).toLocaleString("ko-KR") + "P";
}

export function signedPoint(value: number): string {
  return (value > 0 ? "+" : value < 0 ? "-" : "") + Math.abs(Math.round(value)).toLocaleString("ko-KR") + "P";
}

export function comma(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return Math.round(value).toLocaleString("ko-KR");
}
