import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.join(import.meta.dirname, "app.css"), "utf8");

function colourTokens(selector: string): string[] {
  const block = css.match(new RegExp(`^${selector} \\{([^}]*)\\}`, "m"));
  if (!block) throw new Error(`app.css has no ${selector} block`);
  return [...block[1].matchAll(/^\s*(--[\w-]+):\s*(oklch|rgb|hsl|#)/gm)].map(
    ([, name]) => name
  );
}

describe("app.css theme", () => {
  it("gives every light colour token a dark value", () => {
    const dark = new Set(colourTokens("\\.dark"));
    const missing = colourTokens(":root").filter((name) => !dark.has(name));
    expect(missing).toEqual([]);
  });
});
