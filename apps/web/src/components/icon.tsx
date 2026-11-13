import add from "../assets/icons/add.svg";
import check from "../assets/icons/check.svg";
import chevronLeft from "../assets/icons/chevron-left.svg";
import chevronRight from "../assets/icons/chevron-right.svg";
import close from "../assets/icons/close.svg";
import expandMore from "../assets/icons/expand-more.svg";
import receipt from "../assets/icons/receipt-long.svg";
import remove from "../assets/icons/remove.svg";
import search from "../assets/icons/search.svg";
import cart from "../assets/icons/shopping-cart.svg";
import tune from "../assets/icons/tune.svg";

const ICONS = { add, check, chevronLeft, chevronRight, close, expandMore, receipt, remove, search, cart, tune };
export type IconName = keyof typeof ICONS;

/** 장식 아이콘. 색은 글자색(currentColor)을 따른다. 의미가 있는 아이콘은 곁에 글자나 aria-label을 둔다. */
export function Icon({ name, className = "size-6" }: { name: IconName; className?: string }) {
  const url = `url("${ICONS[name]}")`;
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 bg-current ${className}`}
      style={{ maskImage: url, WebkitMaskImage: url, maskRepeat: "no-repeat", maskPosition: "center", maskSize: "contain" }}
    />
  );
}
