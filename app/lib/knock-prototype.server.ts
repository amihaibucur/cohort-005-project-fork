// PROTOTYPE — throwaway. Answers "What does the Notification Feed look like in Cadence?"
// Lives on the prototype/notification-feed branch only. Not production code.
import { Knock, signUserToken } from "@knocklabs/node";

export const PROTOTYPE_WORKFLOW_KEY = "prototype-notification";

export type NotificationCategory = "refunds" | "discussion" | "team" | "ratings";

export interface PrototypeNotificationData {
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

export async function getFeedAuth(user: { id: number }) {
  return {
    userId: String(user.id),
    token: await signUserToken(String(user.id), {
      signingKey: env("KNOCK_SIGNING_KEY"),
      expiresInSeconds: 60 * 60 * 12,
    }),
    publicKey: env("KNOCK_PUBLIC_API_KEY"),
    channelId: env("KNOCK_FEED_CHANNEL_ID"),
  };
}

// One item per v1 catalogue entry (wayfinder ticket "Which Notifications does Cadence send, and to whom?").
// The prototype sends all seven to whoever is selected, regardless of role, so every row shape is visible.
const CATALOGUE: PrototypeNotificationData[] = [
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
  const knock = new Knock({ apiKey: env("KNOCK_SECRET_API_KEY") });
  for (const data of CATALOGUE) {
    await knock.workflows.trigger(PROTOTYPE_WORKFLOW_KEY, {
      recipients: [{ id: String(user.id), name: user.name }],
      data: data as unknown as Record<string, unknown>,
    });
  }
  return CATALOGUE.length;
}
