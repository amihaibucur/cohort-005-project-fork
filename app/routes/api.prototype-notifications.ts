// PROTOTYPE — throwaway. Sends the v1 catalogue to the current user's Notification Feed via Knock.
import { data } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/api.prototype-notifications";
import { getCurrentUserId } from "~/lib/session";
import { db } from "~/db";
import { users } from "~/db/schema";
import { seedCatalogue } from "~/lib/knock-prototype.server";

export async function action({ request }: Route.ActionArgs) {
  const userId = await getCurrentUserId(request);
  if (!userId) throw data("Select a user from the DevUI panel", { status: 401 });
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw data("User not found", { status: 404 });
  try {
    const count = await seedCatalogue(user);
    return { ok: true as const, count };
  } catch (error) {
    return { ok: false as const, error: String(error) };
  }
}
