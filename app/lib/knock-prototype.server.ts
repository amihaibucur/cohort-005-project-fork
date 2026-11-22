// PROTOTYPE — throwaway. Answers "What does the Notification Feed look like in Cadence?"
// Lives on the prototype/notification-feed branch only. Not production code.
import { Knock, signUserToken } from "@knocklabs/node";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { db } from "~/db";
import { comments, courses, lessons, modules, users } from "~/db/schema";

export type NotificationCategory = "refunds" | "discussion" | "team" | "ratings";

// One Knock workflow per category, each tagged with that Knock category in the
// dashboard (scripts/prototype-feed-wizard.sh). The category lives on the
// workflow, not in the trigger data, because Knock preferences hang off it.
const workflowFor = (category: NotificationCategory) => `prototype-${category}`;

// Deliberately short, like the course spike, so expiry and refresh get exercised.
const TOKEN_TTL_SECONDS = 60 * 10;

interface CatalogueItem {
  kind: string;
  category: NotificationCategory;
  actorName: string;
  title: string;
  body: string;
  url: string;
  cta: string;
}

// Nothing else in the app loads .env, so the prototype does it itself.
try {
  process.loadEnvFile(".env");
} catch {}

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`PROTOTYPE: ${name} missing from .env`);
  return value;
}

const knockClient = () => new Knock({ apiKey: env("KNOCK_SECRET_API_KEY") });

export function signFeedToken(userId: number) {
  return signUserToken(String(userId), {
    signingKey: env("KNOCK_SIGNING_KEY"),
    expiresInSeconds: TOKEN_TTL_SECONDS,
  });
}

export async function getFeedAuth(user: { id: number }) {
  return {
    userId: String(user.id),
    token: await signFeedToken(user.id),
    publicKey: env("KNOCK_PUBLIC_API_KEY"),
    channelId: env("KNOCK_FEED_CHANNEL_ID"),
  };
}

// One item per v1 catalogue entry (wayfinder ticket "Which Notifications does Cadence send, and to whom?").
// The prototype sends all seven to whoever is selected, regardless of role, so every row shape is visible.
const CATALOGUE: CatalogueItem[] = [
  {
    kind: "refund-request-raised",
    category: "refunds",
    actorName: "Emma Wilson",
    title: "Emma Wilson asked for a refund on Introduction to TypeScript",
    body: "“The pace was too fast for me and I couldn't keep up after module 2.”",
    url: "/admin/refunds",
    cta: "Review Refund Request",
  },
  {
    kind: "refund-request-approved",
    category: "refunds",
    actorName: "Alex Rivera",
    title: "Your Refund Request for Design Systems with Tailwind was approved",
    body: "Decision note: “Sorry it wasn't the right fit. The refund is on its way.”",
    url: "/courses/design-systems-with-tailwind",
    cta: "View course",
  },
  {
    kind: "refund-request-declined",
    category: "refunds",
    actorName: "Alex Rivera",
    title: "Your Refund Request for Building REST APIs with Node.js was declined",
    body: "Decision note: “You've completed 80% of the course.” You can raise a new Refund Request.",
    url: "/courses/building-rest-apis-with-nodejs",
    cta: "View course",
  },
  {
    kind: "question-asked",
    category: "discussion",
    actorName: "James Park",
    title: "James Park asked a Question on Primitive Types",
    body: "“Why does `typeof null` return 'object'? Is that a TypeScript thing or JavaScript?”",
    url: "/courses/introduction-to-typescript/lessons/4",
    cta: "Answer Question",
  },
  {
    kind: "reply-posted",
    category: "discussion",
    actorName: "Sarah Chen",
    title: "Your Question on Installing and Configuring TypeScript was answered",
    body: "Sarah Chen: “Set `strict: true` in tsconfig and you get all of those checks at once.”",
    url: "/courses/introduction-to-typescript/lessons/2",
    cta: "Read Reply",
  },
  {
    kind: "seat-claimed",
    category: "team",
    actorName: "Olivia Martinez",
    title: "Olivia Martinez claimed a Seat on Practical Data Visualisation",
    body: "3 of 5 Seats claimed.",
    url: "/team",
    cta: "View Team",
  },
  {
    kind: "first-rating",
    category: "ratings",
    actorName: "Liam Thompson",
    title: "Liam Thompson rated Introduction to TypeScript 4★",
    body: "Your course now has 12 ratings, averaging 4.3★.",
    url: "/instructor/1",
    cta: "View course",
  },
];

export async function seedCatalogue(user: { id: number; name: string }) {
  const knock = knockClient();
  for (const { category, ...data } of CATALOGUE) {
    await knock.workflows.trigger(workflowFor(category), {
      recipients: [{ id: String(user.id), name: user.name }],
      data,
    });
  }
  return CATALOGUE.length;
}

// Real data, like the spike's check 2: the current user replies to the newest
// Question someone else asked, and the Question's author is notified. Never
// the current user, so "nobody is notified about their own action" holds.
export async function sendRealReply(me: { id: number; name: string; email: string }) {
  const q = db
    .select({
      id: comments.id,
      body: comments.body,
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      courseSlug: courses.slug,
      authorId: users.id,
      authorName: users.name,
      authorEmail: users.email,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .innerJoin(lessons, eq(lessons.id, comments.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .where(and(isNull(comments.parentId), isNull(comments.deletedAt), ne(comments.userId, me.id)))
    .orderBy(desc(comments.createdAt))
    .get();
  if (!q) throw new Error("No Question by another user to reply to");

  await knockClient().workflows.trigger(workflowFor("discussion"), {
    recipients: [{ id: String(q.authorId), name: q.authorName, email: q.authorEmail }],
    actor: { id: String(me.id), name: me.name, email: me.email },
    data: {
      kind: "reply-posted",
      actorName: me.name,
      title: `${me.name} replied to your Question on ${q.lessonTitle}`,
      body: `“${q.body.slice(0, 80)}${q.body.length > 80 ? "…" : ""}”`,
      url: `/courses/${q.courseSlug}/lessons/${q.lessonId}`,
      cta: "Read Reply",
    },
  });
  return { recipientId: q.authorId, recipientName: q.authorName };
}

// The spike's negative check, as the browser would make it: public key + my
// signed token, against my feed (expect 200) and someone else's (expect 403).
export async function crossUserCheck(me: { id: number }) {
  const other = db.select().from(users).where(ne(users.id, me.id)).get();
  if (!other) throw new Error("No other user to probe");
  const token = await signFeedToken(me.id);
  const probe = async (userId: number) =>
    (
      await fetch(
        `https://api.knock.app/v1/users/${userId}/feeds/${env("KNOCK_FEED_CHANNEL_ID")}`,
        {
          headers: {
            Authorization: `Bearer ${env("KNOCK_PUBLIC_API_KEY")}`,
            "X-Knock-User-Token": token,
          },
        }
      )
    ).status;
  return { own: await probe(me.id), other: await probe(other.id), otherName: other.name };
}
