// PROTOTYPE — throwaway. Re-signs the Knock user token when the browser says it's about to expire.
import { data } from "react-router";
import type { Route } from "./+types/api.prototype-feed-token";
import { getCurrentUserId } from "~/lib/session";
import { signFeedToken } from "~/lib/knock-prototype.server";

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await getCurrentUserId(request);
  if (!userId) throw data("Select a user from the DevUI panel", { status: 401 });
  return { token: await signFeedToken(userId) };
}
