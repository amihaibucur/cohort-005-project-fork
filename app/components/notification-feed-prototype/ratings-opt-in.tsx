// PROTOTYPE — the spike's check 4, from the browser: an Instructor opts in to
// Ratings Notifications. The environment default (Knock dashboard → Preferences
// → Defaults) has ratings.in_app_feed off, so Ratings stay silent until this is on.
import { useEffect, useState } from "react";
import type { PreferenceSet, WorkflowPreferenceSetting } from "@knocklabs/client";
import { useKnockClient } from "./feed-context";

function isOn(setting: WorkflowPreferenceSetting | undefined) {
  if (setting === undefined) return null; // no user choice: the environment default applies
  if (typeof setting === "boolean") return setting;
  if ("channel_types" in setting) return setting.channel_types.in_app_feed !== false;
  return true;
}

export function RatingsOptIn() {
  const knock = useKnockClient();
  const [prefs, setPrefs] = useState<PreferenceSet | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    knock?.user.getPreferences().then(setPrefs, (e) => console.error("[PROTOTYPE] getPreferences", e));
  }, [knock]);

  const choice = isOn(prefs?.categories?.ratings);
  const on = choice ?? false;

  async function toggle() {
    if (!knock) return;
    setBusy(true);
    try {
      // setPreferences replaces the whole set, so carry the other categories over.
      const next = await knock.user.setPreferences({
        ...(prefs?.workflows ? { workflows: prefs.workflows } : {}),
        ...(prefs?.channel_types ? { channel_types: prefs.channel_types } : {}),
        categories: {
          ...(prefs?.categories ?? {}),
          ratings: { channel_types: { in_app_feed: !on } },
        },
      });
      setPrefs(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className="flex items-center justify-between gap-3 border-t px-4 py-2.5 text-xs text-muted-foreground">
      <span>
        Notify me about new Ratings
        {choice === null && <span className="ml-1 opacity-70">(default: off)</span>}
      </span>
      <input
        type="checkbox"
        className="size-4 accent-sky-600"
        checked={on}
        disabled={!prefs || busy}
        onChange={toggle}
      />
    </label>
  );
}
