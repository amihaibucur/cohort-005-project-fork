const SKY_PAGES = new Set(["/", "/dashboard"]);

export function classNameForPath(pathname: string): string {
  const withoutTrailingSlash = pathname.replace(/\/+$/, "") || "/";
  return SKY_PAGES.has(withoutTrailingSlash) ? "bg-sky" : "bg-background";
}
