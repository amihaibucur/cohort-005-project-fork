import { classNameForPath } from "./lib/pages";

/** Ticket #55 asked for a sky behind the homepage and the dashboard only. */
export function backdropClassName(pathname: string): string {
  return classNameForPath(pathname);
}
