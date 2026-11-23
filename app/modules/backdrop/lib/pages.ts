export type Backdrop = "sky" | "plain";

const SKY_PAGES = new Set(["/", "/dashboard"]);

export function backdropForPath(pathname: string): Backdrop {
  const withoutTrailingSlash = pathname.replace(/\/+$/, "") || "/";
  return SKY_PAGES.has(withoutTrailingSlash) ? "sky" : "plain";
}
