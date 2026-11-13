import type { MeResponse } from "@grabmarket/contracts";
import type { SessionUser } from "../../shared/domain/session-user.ts";

export function toMeResponse(user: SessionUser): MeResponse {
  return { user: { id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone, address: user.address } };
}
