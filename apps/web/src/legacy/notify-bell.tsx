// 머리의 알림 링크와 안 읽은 수 (고객만)
import { Link, useLocation } from "react-router";
import { Icon } from "../components/icon.tsx";
import { useAsync } from "../lib/use-async.ts";
import { legacyGet } from "./legacyApi.ts";

export function NotifyBell() {
  const location = useLocation();
  const unread = useAsync("unread:" + location.key, () => legacyGet("/api/notifications/unread-count"));
  const count = unread.status === "ready" ? Number(unread.data.unreadCount) : 0;
  return (
    <Link to="/notifications" className="relative flex flex-col items-center gap-0.5 text-2xs font-semibold text-ink-2 md:text-xs">
      <Icon name="bell" className="size-5.5 text-ink md:size-6" />
      알림
      {count > 0 && (
        <b
          aria-label={"안 읽은 알림 " + count + "개"}
          className="absolute -top-1 -right-1 min-w-4 rounded-pill bg-ink px-1 text-center text-2xs leading-4 font-bold text-on-dark md:min-w-4.5 md:text-xs md:leading-4.5"
        >
          {count > 99 ? "99+" : count}
        </b>
      )}
    </Link>
  );
}
