// PROTOTYPE — floating variant switcher + "send the catalogue" button. Dev only.
import { ChevronLeft, ChevronRight, MessageSquareReply, Send, ShieldCheck } from "lucide-react";
import { useEffect } from "react";
import { useFetcher, useNavigate, useSearchParams, useLocation } from "react-router";
import { toast } from "sonner";
import * as A from "./variant-a-bell";
import * as B from "./variant-b-drawer";
import * as C from "./variant-c-inbox";

export const VARIANTS = { A: A.name, B: B.name, C: C.name } as const;
export type VariantKey = keyof typeof VARIANTS;
const KEYS = Object.keys(VARIANTS) as VariantKey[];
const STORAGE = "prototype-notification-feed-variant";

// ?variant= wins; otherwise remember the last pick across navigations (rows link away).
export function useVariant(): VariantKey {
  const [params] = useSearchParams();
  const fromUrl = params.get("variant") as VariantKey | null;
  let stored: VariantKey | null = null;
  try {
    if (typeof window !== "undefined") stored = sessionStorage.getItem(STORAGE) as VariantKey | null;
  } catch {}
  const v = fromUrl && KEYS.includes(fromUrl) ? fromUrl : stored && KEYS.includes(stored) ? stored : "A";
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE, v);
    } catch {}
  }, [v]);
  return v;
}

export function PrototypeSwitcher() {
  const current = useVariant();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const fetcher = useFetcher<{ ok: boolean; message: string }>();

  function go(delta: number) {
    const next = KEYS[(KEYS.indexOf(current) + delta + KEYS.length) % KEYS.length];
    const p = new URLSearchParams(params);
    p.set("variant", next);
    navigate(`${location.pathname}?${p}`, { replace: true });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable=true]")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.ok) toast.success(fetcher.data.message, { duration: 8000 });
    else toast.error(fetcher.data.message, { duration: 8000 });
  }, [fetcher.state, fetcher.data]);

  if (!import.meta.env.DEV) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full bg-black px-2 py-1.5 text-sm text-white shadow-2xl ring-2 ring-yellow-400">
      <button onClick={() => go(-1)} className="rounded-full p-1 hover:bg-white/20">
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-44 text-center font-mono">
        {current} ({VARIANTS[current]})
      </span>
      <button onClick={() => go(1)} className="rounded-full p-1 hover:bg-white/20">
        <ChevronRight className="size-4" />
      </button>
      <span className="mx-1 h-4 w-px bg-white/30" />
      <fetcher.Form method="post" action="/api/prototype-notifications" className="flex">
        {(
          [
            ["catalogue", Send, "Send catalogue", "Trigger the 7 catalogue Notifications for the current user"],
            ["real-reply", MessageSquareReply, "Real Reply", "Reply as the current user to someone else's newest Question; notifies its author"],
            ["cross-user-check", ShieldCheck, "403 check", "Use my signed token on someone else's feed; Knock must refuse"],
          ] as const
        ).map(([intent, Icon, label, title]) => (
          <button
            key={intent}
            name="intent"
            value={intent}
            disabled={fetcher.state !== "idle"}
            className="flex items-center gap-1 rounded-full px-2 py-1 hover:bg-white/20 disabled:opacity-50"
            title={title}
          >
            <Icon className="size-3.5" />
            {fetcher.state !== "idle" && fetcher.formData?.get("intent") === intent ? "…" : label}
          </button>
        ))}
      </fetcher.Form>
    </div>
  );
}
