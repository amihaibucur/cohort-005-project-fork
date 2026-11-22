// PROTOTYPE — throwaway. Headless Knock feed shared by every Notification Feed variant.
import Knock, { type Feed, type FeedItem, type FeedMetadata } from "@knocklabs/client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { Receipt, MessageSquare, UsersRound, Star } from "lucide-react";

export interface FeedAuth {
  userId: string;
  token: string;
  publicKey: string;
  channelId: string;
}

export interface NotificationData {
  kind: string;
  category: "refunds" | "discussion" | "team" | "ratings";
  actorName: string;
  title: string;
  body: string;
  url: string;
  cta: string;
}

export type Notification = FeedItem<NotificationData>;

const FeedContext = createContext<Feed | null>(null);

export function NotificationFeedProvider({
  auth,
  children,
}: {
  auth: FeedAuth | null;
  children: React.ReactNode;
}) {
  const [feed, setFeed] = useState<Feed | null>(null);

  useEffect(() => {
    if (!auth) return;
    const knock = new Knock(auth.publicKey);
    knock.authenticate(auth.userId, auth.token);
    const f = knock.feeds.initialize(auth.channelId, {
      archived: "exclude",
      page_size: 50,
    });
    f.listenForUpdates();
    f.fetch();
    setFeed(f);
    return () => {
      f.dispose();
      knock.teardown();
      setFeed(null);
    };
  }, [auth?.userId, auth?.token]);

  return <FeedContext.Provider value={feed}>{children}</FeedContext.Provider>;
}

const EMPTY: { items: Notification[]; metadata: FeedMetadata; loading: boolean } = {
  items: [],
  metadata: { total_count: 0, unread_count: 0, unseen_count: 0 },
  loading: true,
};

export function useNotificationFeed() {
  const feed = useContext(FeedContext);
  const state = useSyncExternalStore(
    (cb) => (feed ? feed.store.subscribe(cb) : () => {}),
    () => (feed ? feed.store.getState() : EMPTY),
    () => EMPTY
  );
  return {
    feed,
    items: state.items as Notification[],
    metadata: state.metadata,
    loading: state.loading,
  };
}

export const CATEGORY_META = {
  refunds: { label: "Refunds", Icon: Receipt, tone: "text-amber-600 bg-amber-100 dark:bg-amber-950 dark:text-amber-400" },
  discussion: { label: "Discussion", Icon: MessageSquare, tone: "text-sky-600 bg-sky-100 dark:bg-sky-950 dark:text-sky-400" },
  team: { label: "Team", Icon: UsersRound, tone: "text-violet-600 bg-violet-100 dark:bg-violet-950 dark:text-violet-400" },
  ratings: { label: "Ratings", Icon: Star, tone: "text-rose-600 bg-rose-100 dark:bg-rose-950 dark:text-rose-400" },
} as const;

export function categoryOf(item: Notification) {
  return CATEGORY_META[item.data?.category ?? "discussion"] ?? CATEGORY_META.discussion;
}

export function timeAgo(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
}
