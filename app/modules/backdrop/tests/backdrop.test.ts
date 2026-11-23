import { describe, it, expect } from "vitest";
import { backdropClassName } from "../index";

describe("backdropClassName", () => {
  it("paints the sky on the homepage", () => {
    expect(backdropClassName("/")).toBe("bg-sky");
  });

  it("paints the sky on the dashboard", () => {
    expect(backdropClassName("/dashboard")).toBe("bg-sky");
  });

  it("ignores a trailing slash", () => {
    expect(backdropClassName("/dashboard/")).toBe("bg-sky");
    expect(backdropClassName("/dashboard//")).toBe("bg-sky");
    expect(backdropClassName("//")).toBe("bg-sky");
  });

  it("keeps the theme background on every other page", () => {
    expect(backdropClassName("/courses")).toBe("bg-background");
    expect(backdropClassName("/dashboard/extra")).toBe("bg-background");
    expect(backdropClassName("/settings/")).toBe("bg-background");
  });
});
