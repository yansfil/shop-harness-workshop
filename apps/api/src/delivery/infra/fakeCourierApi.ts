// 가짜 택배사 API. 실제 택배사와 연결하지 않고 등록 시각을 기준으로 단계를 흉내 낸다.
import { COURIERS, courierName, isTrackingNo, log, trim, upper } from "../../legacy/legacyUtils.ts";
import { isDeliveredBy, timeline } from "../domain/trackingSteps.ts";

export function couriers(): any[] {
  return COURIERS.map((c: any) => ({ code: c.code, name: c.name }));
}

export function isKnownCourier(code: any): boolean {
  return COURIERS.some((c: any) => c.code === code);
}

/** 송장 번호 형식 검사: 택배사 앞글자와 맞아야 한다 */
export function checkTrackingNo(courierCode: any, trackingNo: any): string | null {
  const no = upper(trackingNo);
  if (!isKnownCourier(courierCode)) return "택배사를 골라 주세요.";
  if (!isTrackingNo(no)) return "송장 번호는 SB-0000-0000-0000 형식이에요.";
  const courier = COURIERS.find((c: any) => c.code === courierCode);
  if (courier && no.slice(0, 2) !== courier.prefix) return courierName(courierCode) + " 송장은 " + courier.prefix + "로 시작해요.";
  return null;
}

/** 택배사에 송장 등록 (항상 접수됨) */
export function registerParcel(courierCode: string, trackingNo: string, orderNumber: string): any {
  log("courier_registered", { courier: courierCode, trackingNo: trackingNo, orderNumber: orderNumber });
  return { accepted: true, courier: courierCode, trackingNo: upper(trackingNo) };
}

/** 택배사 조회 */
export function track(shipment: any, nowValue: any): any {
  const events = timeline(shipment.registered_at, shipment.delivered_at, nowValue);
  return {
    courier: shipment.courier_code,
    courierName: courierName(shipment.courier_code),
    trackingNo: trim(shipment.tracking_no),
    events: events,
    delivered: shipment.delivered_at ? true : isDeliveredBy(shipment.registered_at, nowValue),
  };
}
