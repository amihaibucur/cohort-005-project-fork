// PROTOTYPE — Variant A: bell in the sidebar header, popover feed.
// Badge = unread count: it stays until each Notification is clicked or
// "Mark all as read" is pressed. Opening the popover still marks everything
// seen in Knock (bookkeeping only; the badge doesn't use it).
// Click = mark read + navigate + close.
import { Bell, CheckCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { cn } from "~/lib/utils";
import {
  categoryOf,
  initials,
  timeAgo,
  useNotificationFeed,
  type Notification,
} from "./feed-context";
import { RatingsOptIn } from "./ratings-opt-in";

export const name = "Bell + popover";

// Knock's actor when the trigger passed one (real Reply), else the catalogue's fake name.
function actorName(item: Notification) {
  const actor = item.actors?.[0];
  return (actor && "name" in actor && actor.name) || item.data?.actorName || "?";
}

export function VariantABell() {
  const { feed, items, metadata } = useNotificationFeed();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    feed?.markAllAsSeen();
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, feed]);

  function onClick(item: Notification) {
    feed?.markAsRead(item);
    feed?.markAsInteracted(item);
    setOpen(false);
    if (item.data?.url) navigate(item.data.url);
  }

  const unread = metadata.unread_count;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        className="relative rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-full top-0 z-50 ml-3 w-96 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="font-semibold">Notifications</div>
            <button
              onClick={() => feed?.markAllAsRead()}
              disabled={metadata.unread_count === 0}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <CheckCheck className="size-3.5" /> Mark all as read
            </button>
          </div>
          <div className="max-h-[28rem] overflow-y-auto">
            {items.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                You're all caught up.
              </div>
            )}
            {items.map((item) => {
              const cat = categoryOf(item);
              const unread = !item.read_at;
              return (
                <button
                  key={item.id}
                  onClick={() => onClick(item)}
                  className={cn(
                    "flex w-full gap-3 border-b px-4 py-3 text-left last:border-b-0 hover:bg-accent",
                    unread && "bg-sky-50/60 dark:bg-sky-950/30"
                  )}
                >
                  <div className="relative shrink-0">
                    <div className="flex size-9 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                      {initials(actorName(item))}
                    </div>
                    <div
                      className={cn(
                        "absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full ring-2 ring-popover",
                        cat.tone
                      )}
                    >
                      <cat.Icon className="size-3" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={cn("text-sm", unread ? "font-semibold" : "font-normal")}>
                      {item.data?.title}
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {item.data?.body}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {timeAgo(item.inserted_at)}
                    </div>
                  </div>
                  {unread && <div className="mt-1.5 size-2 shrink-0 rounded-full bg-sky-500" />}
                </button>
              );
            })}
          </div>
          <RatingsOptIn />
        </div>
      )}
    </div>
  );
}
