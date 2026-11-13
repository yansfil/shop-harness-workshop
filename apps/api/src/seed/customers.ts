import { DEMO_ACCOUNTS } from "@grabmarket/contracts";
import { Prng } from "./prng.ts";

export const FAKE_ADDRESS = "서울특별시 한울구 새벽로 12, 302호";

export interface SeedCustomer {
  email: string;
  name: string;
  phone: string;
  address: string;
  /** 로그인할 수 있는 교육용 계정이면 비밀번호, 주문만 가진 고객이면 undefined */
  password: string | undefined;
}

const SURNAMES = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권", "황", "안", "송", "류", "전"];
const GIVEN_NAMES = ["하늘", "도윤", "서연", "민준", "지우", "서준", "하윤", "예준", "지민", "주원", "수아", "시우", "유진", "현우", "나은", "지호", "채원", "건우", "다은", "민재", "소율", "태민", "예린", "준서", "아린"];

export const ORDER_ONLY_CUSTOMER_COUNT = 200;

/** 로그인 고객 2명(DEMO_ACCOUNTS)과 주문만 가진 고객 200명. 같은 prng면 같은 목록이다. */
export function planCustomers(prng: Prng): SeedCustomer[] {
  const demo = DEMO_ACCOUNTS.filter((account) => account.role === "customer").map(
    (account): SeedCustomer => ({ email: account.email, name: account.name, phone: "010-1234-5678", address: FAKE_ADDRESS, password: account.password }),
  );
  const others = Array.from({ length: ORDER_ONLY_CUSTOMER_COUNT }, (_, index): SeedCustomer => ({
    email: `member${String(index + 1).padStart(3, "0")}@grabmarket.test`,
    name: `${prng.pick(SURNAMES)}${prng.pick(GIVEN_NAMES)}`,
    phone: `010-${prng.int(1000, 9999)}-${prng.int(1000, 9999)}`,
    address: `서울특별시 한울구 새벽로 ${prng.int(1, 80)}, ${prng.int(101, 1504)}호`,
    password: undefined,
  }));
  return [...demo, ...others];
}
