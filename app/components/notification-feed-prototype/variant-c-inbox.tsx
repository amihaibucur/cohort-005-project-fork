// PROTOTYPE — Variant C: a full "Inbox" page (/notifications), two-pane list + detail,
// plus real-time toasts. The nav item only shows a dot (no number) while anything is unseen.
// Visiting the Inbox marks everything seen; selecting a row marks it read and shows the detail;
// the detail's button is what navigates. Archive removes a row.
import { Archive, Inbox } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router";
import { toast } from "sonner";
import { cn } from "~/lib/utils";
import {
  categoryOf,
  initials,
  timeAgo,
  useNotificationFeed,
  type Notification,
  type NotificationData,
} from "./feed-context";

export const name = "Inbox page + toasts";

export function VariantCNavItem() {
  const { metadata } = useNotificationFeed();
  return (
    <NavLink
      to="/notifications?variant=C"
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )
      }
    >
      <Inbox className="size-4" />
      Inbox
      {metadata.unseen_count > 0 && <span className="ml-auto size-2 rounded-full bg-red-600" />}
    </NavLink>
  );
}

export function VariantCToasts() {
  const { feed } = useNotificationFeed();
  const navigate = useNavigate();
  useEffect(() => {
    if (!feed) return;
    const onNew = ({ items }: { items: Notification[] }) => {
      for (const item of items) {
        toast(item.data?.title ?? "New Notification", {
          description: item.data?.body,
          action: item.data?.url
            ? {
                label: item.data.cta,
                onClick: () => {
                  feed.markAsRead(item);
                  navigate(item.data!.url);
                },
              }
            : undefined,
        });
      }
    };
    feed.on("items.received.realtime", onNew as never);
    return () => feed.off("items.received.realtime", onNew as never);
  }, [feed, navigate]);
  return null;
}

export function VariantCInboxPage() {
  const { feed, items, metadata, loading } = useNotificationFeed();
  const [tab, setTab] = useState<"unread" | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (metadata.unseen_count > 0) feed?.markAllAsSeen();
  }, [feed, metadata.unseen_count]);

  const visible = items.filter((i) => tab === "all" || !i.read_at);
  const selected = items.find((i) => i.id === selectedId) ?? null;

  function select(item: Notification) {
    setSelectedId(item.id);
    if (!item.read_at) feed?.markAsRead(item);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-8 py-5">
        <div>
          <h1 className="text-2xl font-bold">Inbox</h1>
          <p className="text-sm text-muted-foreground">
            {metadata.unread_count} unread of {metadata.total_count}
          </p>
        </div>
        <button
          onClick={() => feed?.markAllAsRead()}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
        >
          Mark all as read
        </button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex w-[24rem] shrink-0 flex-col border-r">
          <div className="flex gap-4 border-b px-4">
            {(["all", "unread"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "-mb-px border-b-2 py-2.5 text-sm capitalize",
                  tab === t ? "border-primary font-medium" : "border-transparent text-muted-foreground"
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            {!loading && visible.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">Inbox zero.</div>
            )}
            {visible.map((item) => {
              const cat = categoryOf(item);
              return (
                <button
                  key={item.id}
                  onClick={() => select(item)}
                  className={cn(
                    "flex w-full items-start gap-3 border-b px-4 py-3 text-left hover:bg-accent",
                    selectedId === item.id && "bg-accent"
                  )}
                >
                  <div className={cn("mt-1 size-2 shrink-0 rounded-full", item.read_at ? "bg-transparent" : "bg-sky-500")} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase", cat.tone)}>
                        {cat.label}
                      </span>
                      <span className="ml-auto">{timeAgo(item.inserted_at)}</span>
                    </div>
                    <div className={cn("mt-1 line-clamp-2 text-sm", !item.read_at && "font-semibold")}>
                      {item.data?.title}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {selected ? (
            <Detail
              item={selected}
              onGo={(d) => navigate(d.url)}
              onArchive={() => {
                feed?.markAsArchived(selected);
                setSelectedId(null);
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a Notification
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Detail({
  item,
  onGo,
  onArchive,
}: {
  item: Notification;
  onGo: (d: NotificationData) => void;
  onArchive: () => void;
}) {
  const cat = categoryOf(item);
  const d = item.data;
  if (!d) return null;
  return (
    <div className="mx-auto max-w-xl px-8 py-10">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-full bg-muted font-semibold">
          {initials(d.actorName)}
        </div>
        <div>
          <div className="font-medium">{d.actorName}</div>
          <div className="text-xs text-muted-foreground">
            {cat.label} · {new Date(item.inserted_at).toLocaleString()}
          </div>
        </div>
        <button onClick={onArchive} title="Archive" className="ml-auto rounded-md p-2 hover:bg-accent">
          <Archive className="size-4" />
        </button>
      </div>
      <h2 className="mt-6 text-xl font-semibold">{d.title}</h2>
      <p className="mt-3 text-muted-foreground">{d.body}</p>
      <button
        onClick={() => onGo(d)}
        className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        {d.cta} →
      </button>
    </div>
  );
}
