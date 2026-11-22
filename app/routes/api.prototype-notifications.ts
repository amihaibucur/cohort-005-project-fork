// PROTOTYPE — throwaway. Dev-bar actions against Knock: send the catalogue,
// send a real Reply Notification, and run the cross-user token check.
import { data } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/api.prototype-notifications";
import { getCurrentUserId } from "~/lib/session";
import { db } from "~/db";
import { users } from "~/db/schema";
import { crossUserCheck, seedCatalogue, sendRealReply } from "~/lib/knock-prototype.server";

export async function action({ request }: Route.ActionArgs) {
  const userId = await getCurrentUserId(request);
  if (!userId) throw data("Select a user from the DevUI panel", { status: 401 });
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw data("User not found", { status: 404 });
  const intent = (await request.formData()).get("intent");
  try {
    if (intent === "real-reply") {
      const r = await sendRealReply(user);
      return {
        ok: true as const,
        message: `Replied as ${user.name}: notified ${r.recipientName} (id ${r.recipientId}). Switch to them in DevUI to see it.`,
      };
    }
    if (intent === "cross-user-check") {
      const r = await crossUserCheck(user);
      const pass = r.own === 200 && r.other === 403;
      return {
        ok: pass,
        message: `${pass ? "PASS" : "FAIL"}: own feed ${r.own}, ${r.otherName}'s feed ${r.other} (expect 200 / 403)`,
      };
    }
    const count = await seedCatalogue(user);
    return {
      ok: true as const,
      message: `Triggered ${count} Notifications (Ratings only lands if you opted in)`,
    };
  } catch (error) {
    return { ok: false as const, message: String(error) };
  }
}
