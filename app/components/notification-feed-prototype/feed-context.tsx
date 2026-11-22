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

export type CategoryKey = "refunds" | "discussion" | "team" | "ratings";

export interface NotificationData {
  kind: string;
  actorName: string;
  title: string;
  body: string;
  url: string;
  cta: string;
}

export type Notification = FeedItem<NotificationData>;

const FeedContext = createContext<Feed | null>(null);
const KnockContext = createContext<Knock | null>(null);

export const useKnockClient = () => useContext(KnockContext);

export function NotificationFeedProvider({
  auth,
  children,
}: {
  auth: FeedAuth | null;
  children: React.ReactNode;
}) {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [knockClient, setKnockClient] = useState<Knock | null>(null);

  // Keyed on the user, not the token: every loader run signs a fresh token, and
  // re-initialising the feed on each navigation would drop the socket.
  // Before the short-lived token expires, ask Cadence for a new one.
  useEffect(() => {
    if (!auth) return;
    const knock = new Knock(auth.publicKey);
    knock.authenticate(auth.userId, auth.token, {
      timeBeforeExpirationInMs: 60_000,
      onUserTokenExpiring: async () => {
        const res = await fetch("/api/prototype-feed-token");
        if (!res.ok) return;
        const { token } = (await res.json()) as { token: string };
        console.info("[PROTOTYPE] Knock user token refreshed");
        return token;
      },
    });
    const f = knock.feeds.initialize(auth.channelId, {
      archived: "exclude",
      page_size: 50,
    });
    f.listenForUpdates();
    f.fetch();
    setFeed(f);
    setKnockClient(knock);
    return () => {
      f.dispose();
      knock.teardown();
      setFeed(null);
      setKnockClient(null);
    };
  }, [auth?.userId]);

  return (
    <KnockContext.Provider value={knockClient}>
      <FeedContext.Provider value={feed}>{children}</FeedContext.Provider>
    </KnockContext.Provider>
  );
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

// The category comes from the Knock workflow (source.categories), not the trigger data.
export function categoryKeyOf(item: Notification): CategoryKey {
  const key = item.source?.categories?.find((c): c is CategoryKey => c in CATEGORY_META);
  return key ?? "discussion";
}

export function categoryOf(item: Notification) {
  return CATEGORY_META[categoryKeyOf(item)];
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
