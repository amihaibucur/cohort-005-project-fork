// PROTOTYPE — Variant B: "Notifications" nav item with an unread-count pill, right-hand drawer.
// No separate "seen" state: the pill is the unread count and only drops when rows are read.
// Category filter chips, Today / Earlier grouping, compact one-line rows with hover actions
// (mark read/unread, archive). Click = mark read + navigate; drawer stays open.
import { Archive, Bell, Circle, CircleDot, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { cn } from "~/lib/utils";
import {
  CATEGORY_META,
  categoryOf,
  timeAgo,
  useNotificationFeed,
  type Notification,
  type NotificationData,
} from "./feed-context";

export const name = "Nav item + drawer";

type Filter = "all" | NotificationData["category"];

export function VariantBNavItem() {
  const { metadata } = useNotificationFeed();
  const [open, setOpen] = useState(false);
  const unread = metadata.unread_count;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Bell className="size-4" />
        Notifications
        {unread > 0 && (
          <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
            {unread}
          </span>
        )}
      </button>
      {open && <Drawer onClose={() => setOpen(false)} />}
    </>
  );
}

function Drawer({ onClose }: { onClose: () => void }) {
  const { feed, items, metadata } = useNotificationFeed();
  const [filter, setFilter] = useState<Filter>("all");
  const navigate = useNavigate();

  const visible = items.filter((i) => filter === "all" || i.data?.category === filter);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const today = visible.filter((i) => new Date(i.inserted_at) >= startOfToday);
  const earlier = visible.filter((i) => new Date(i.inserted_at) < startOfToday);

  function open(item: Notification) {
    feed?.markAsRead(item);
    feed?.markAsInteracted(item);
    if (item.data?.url) navigate(item.data.url);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="relative flex h-full w-[26rem] flex-col border-l bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <div className="text-lg font-semibold">Notifications</div>
            <div className="text-xs text-muted-foreground">
              {metadata.unread_count} unread
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => feed?.markAllAsRead()}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Mark all read
            </button>
            <button onClick={onClose} className="rounded-md p-1 hover:bg-accent">
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 border-b px-5 py-3">
          {(["all", "refunds", "discussion", "team", "ratings"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                filter === f
                  ? "border-primary bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent"
              )}
            >
              {f === "all" ? "All" : CATEGORY_META[f].label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {visible.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Nothing here.
            </div>
          )}
          <Group label="Today" items={today} onOpen={open} />
          <Group label="Earlier" items={earlier} onOpen={open} />
        </div>
      </aside>
    </div>
  );
}

function Group({
  label,
  items,
  onOpen,
}: {
  label: string;
  items: Notification[];
  onOpen: (i: Notification) => void;
}) {
  const { feed } = useNotificationFeed();
  if (items.length === 0) return null;
  return (
    <div>
      <div className="sticky top-0 bg-background px-5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {items.map((item) => {
        const cat = categoryOf(item);
        const unread = !item.read_at;
        return (
          <div
            key={item.id}
            className="group flex cursor-pointer items-center gap-3 px-5 py-2.5 hover:bg-accent"
            onClick={() => onOpen(item)}
          >
            <cat.Icon className={cn("size-4 shrink-0", cat.tone.split(" ")[0])} />
            <div
              className={cn(
                "min-w-0 flex-1 truncate text-sm",
                unread ? "font-semibold" : "text-muted-foreground"
              )}
              title={item.data?.title}
            >
              {item.data?.title}
            </div>
            <div className="shrink-0 text-[11px] text-muted-foreground group-hover:hidden">
              {timeAgo(item.inserted_at)}
            </div>
            <div className="hidden shrink-0 items-center gap-1 group-hover:flex">
              <button
                title={unread ? "Mark as read" : "Mark as unread"}
                onClick={(e) => {
                  e.stopPropagation();
                  unread ? feed?.markAsRead(item) : feed?.markAsUnread(item);
                }}
                className="rounded p-1 hover:bg-background"
              >
                {unread ? <Circle className="size-3.5" /> : <CircleDot className="size-3.5" />}
              </button>
              <button
                title="Archive"
                onClick={(e) => {
                  e.stopPropagation();
                  feed?.markAsArchived(item);
                }}
                className="rounded p-1 hover:bg-background"
              >
                <Archive className="size-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
