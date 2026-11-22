// PROTOTYPE — throwaway debug page for Knock, modelled on the course's knock-spike
// (/prototype/knock). Lives on the prototype/notification-feed branch only.
//
// 1. Signed user token: who the browser is in Knock, when the token expires,
//    and the negative check (my token on someone else's feed must fail).
// 2. Real triggers: Reply → Question author (discussion), Rating → Instructor
//    (ratings, opt-in only). Always to someone else, with me as Knock actor.
// 3. Feed state: the same realtime feed the bell uses, with raw seen/read
//    flags, counts and mark buttons.
// 4. Preferences: my Ratings opt-in, server side, and what the browser sees.
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/prototype.knock";
import { requireUserId } from "~/lib/access.server";
import { db } from "~/db";
import { users } from "~/db/schema";
import { Button } from "~/components/ui/button";
import {
  crossUserCheck,
  getServerPreferences,
  knockUserId,
  listTriggerTargets,
  sendRating,
  sendRealReply,
  setRatingsPreference,
} from "~/lib/knock-prototype.server";
import {
  categoryKeyOf,
  useKnockClient,
  useNotificationFeed,
} from "~/components/notification-feed-prototype/feed-context";

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireUserId(request);
  const me = db.select().from(users).where(eq(users.id, userId)).get()!;
  return {
    me: { id: me.id, name: me.name, role: me.role },
    knockUserId: knockUserId(me.id),
    ...listTriggerTargets(me),
    preferences: await getServerPreferences(me.id),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const userId = await requireUserId(request);
  const me = db.select().from(users).where(eq(users.id, userId)).get()!;
  const form = await request.formData();
  const intent = String(form.get("intent"));
  try {
    switch (intent) {
      case "cross-user-check": {
        const r = await crossUserCheck(me);
        const pass = r.own === 200 && r.other === 403;
        return { intent, ok: pass, message: `${pass ? "PASS" : "FAIL"}: own feed ${r.own}, ${r.otherName}'s feed ${r.other}` };
      }
      case "reply": {
        const r = await sendRealReply(me, Number(form.get("questionId")));
        return { intent, ok: true, message: `Reply → notified ${r.recipientName} (id ${r.recipientId}); switch to them to see it` };
      }
      case "rating": {
        const r = await sendRating(me, Number(form.get("courseId")));
        return { intent, ok: true, message: `Rating → triggered for ${r.recipientName} (id ${r.recipientId}); lands only if they opted in` };
      }
      case "ratings-on":
      case "ratings-off":
      case "ratings-reset": {
        const on = intent === "ratings-on" ? true : intent === "ratings-off" ? false : null;
        await setRatingsPreference(me.id, on);
        return { intent, ok: true, message: `My Ratings preference: ${on === null ? "reset to environment default" : on ? "on" : "off"}` };
      }
    }
    return { intent, ok: false, message: `Unknown intent ${intent}` };
  } catch (e) {
    return { intent, ok: false, message: String(e) };
  }
}

function decodeToken(token: string | undefined) {
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as {
      sub: string;
      exp: number;
    };
  } catch {
    return null;
  }
}

export default function KnockPrototype({ loaderData }: Route.ComponentProps) {
  const { me, questions, courseList, preferences } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const knock = useKnockClient();
  const { feed, items, metadata, loading } = useNotificationFeed();
  const [log, setLog] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const push = (line: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString()} ${line}`, ...l].slice(0, 30));

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const d = fetcher.data;
    if (!d) return;
    push(`${d.ok ? "✓" : "✗"} ${d.intent}: ${d.message}`);
    (d.ok ? toast.success : toast.error)(d.message);
  }, [fetcher.data]);

  // The token the browser is using right now (refreshes swap it in place).
  const token = decodeToken(knock?.userToken);
  const secondsLeft = token ? Math.round(token.exp - now / 1000) : null;

  async function browserPreferences() {
    if (!knock) return;
    try {
      push(`browser getPreferences → ${JSON.stringify(await knock.user.getPreferences())}`);
    } catch (e) {
      push(`browser getPreferences failed: ${String(e)}`);
    }
  }

  const post = (fields: Record<string, string | number>) =>
    fetcher.submit(fields as Record<string, string>, { method: "post" });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 font-mono text-sm">
      <div className="rounded border-2 border-dashed border-amber-500 bg-amber-50 p-3 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
        PROTOTYPE: Knock debug page. Throwaway. Switch users in the DevUI panel; everything
        below re-authenticates as them.
      </div>

      <section>
        <h2 className="font-bold">1. Signed user token</h2>
        <p>
          Signed in as <b>{me.name}</b> ({me.role}), Knock user id <b>{loaderData.knockUserId}</b>
        </p>
        <p className="text-xs text-muted-foreground">
          token sub = {token?.sub ?? "…"} · expires in{" "}
          {secondsLeft === null ? "…" : `${Math.floor(secondsLeft / 60)}m ${secondsLeft % 60}s`} (refreshes
          ~60s before expiry)
        </p>
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="outline" onClick={() => post({ intent: "cross-user-check" })}>
            Try another user's feed with my token (should be 403)
          </Button>
          <Button size="sm" variant="outline" onClick={browserPreferences}>
            Read my preferences from the browser
          </Button>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="space-y-5">
          <div>
            <h2 className="font-bold">2a. Reply → Question author (discussion)</h2>
            {questions.length === 0 && <p className="text-muted-foreground">No Questions by others.</p>}
            {questions.map((q) => (
              <div key={q.id} className="mt-1 flex items-center gap-2">
                <Button size="sm" onClick={() => post({ intent: "reply", questionId: q.id })}>
                  Reply → notify {q.authorName}
                </Button>
                <span className="truncate text-xs">“{q.body.slice(0, 40)}”</span>
              </div>
            ))}
          </div>

          <div>
            <h2 className="font-bold">2b. Rating → Instructor (ratings, opt-in only)</h2>
            {courseList.length === 0 && <p className="text-muted-foreground">No courses by others.</p>}
            {courseList.map((c) => (
              <div key={c.id} className="mt-1 flex items-center gap-2">
                <Button size="sm" onClick={() => post({ intent: "rating", courseId: c.id })}>
                  Rate → notify {c.instructorName}
                </Button>
                <span className="truncate text-xs">{c.title}</span>
              </div>
            ))}
          </div>

          <div>
            <h2 className="font-bold">4. My Ratings preference (server side)</h2>
            <div className="mt-1 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => post({ intent: "ratings-on" })}>
                Opt in
              </Button>
              <Button size="sm" variant="outline" onClick={() => post({ intent: "ratings-off" })}>
                Opt out
              </Button>
              <Button size="sm" variant="outline" onClick={() => post({ intent: "ratings-reset" })}>
                Reset to default
              </Button>
            </div>
            <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted p-2 text-xs">
              {JSON.stringify(preferences, null, 2)}
            </pre>
          </div>
        </section>

        <section>
          <h2 className="font-bold">3. Feed (browser → Knock, realtime)</h2>
          {loading ? (
            <p>loading…</p>
          ) : (
            <>
              <p>
                unread <b>{metadata.unread_count}</b> · unseen <b>{metadata.unseen_count}</b> · total{" "}
                <b>{metadata.total_count}</b>
              </p>
              <div className="my-2 flex gap-2">
                <Button size="sm" variant="outline" disabled={!metadata.unseen_count} onClick={() => feed?.markAllAsSeen()}>
                  Mark all seen
                </Button>
                <Button size="sm" variant="outline" disabled={!metadata.unread_count} onClick={() => feed?.markAllAsRead()}>
                  Mark all read
                </Button>
              </div>
              <ul className="space-y-2">
                {items.map((e) => (
                  <li key={e.id} className={`rounded border p-2 ${e.read_at ? "opacity-60" : "border-blue-500"}`}>
                    <div>
                      <b>{e.source.key}</b> [{categoryKeyOf(e)}] from{" "}
                      {(e.actors[0] && "name" in e.actors[0] && e.actors[0].name) || e.data?.actorName || "?"}
                    </div>
                    <div className="text-xs">{e.data?.title}</div>
                    <div className="text-xs text-muted-foreground">
                      seen {e.seen_at ? "✓" : "✗"} · read {e.read_at ? "✓" : "✗"} · {e.inserted_at}
                    </div>
                    <div className="flex gap-1">
                      <Button size="xs" variant="ghost" onClick={() => (e.read_at ? feed?.markAsUnread(e) : feed?.markAsRead(e))}>
                        mark {e.read_at ? "unread" : "read"}
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => feed?.markAsArchived(e)}>
                        archive
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      <section>
        <h2 className="font-bold">Log</h2>
        <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs">{log.join("\n")}</pre>
      </section>
    </div>
  );
}
