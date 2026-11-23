import { backdropForPath } from "./lib/pages";

export type { Backdrop } from "./lib/pages";

/**
 * The page background for a path. The homepage and the dashboard sit on a
 * sky gradient; every other page keeps the plain theme background.
 */
export function backdropFor(pathname: string) {
  return backdropForPath(pathname);
}

/** The class name that paints a page's background. */
export function backdropClassName(pathname: string): string {
  return backdropFor(pathname) === "sky" ? "bg-sky" : "bg-background";
}
