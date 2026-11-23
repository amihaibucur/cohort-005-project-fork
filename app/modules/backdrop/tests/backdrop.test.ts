import { describe, it, expect } from "vitest";
import { backdropFor, backdropClassName } from "../index";

describe("backdropFor", () => {
  it("puts the homepage on the sky", () => {
    expect(backdropFor("/")).toBe("sky");
  });

  it("puts the dashboard on the sky", () => {
    expect(backdropFor("/dashboard")).toBe("sky");
  });

  it("ignores a trailing slash", () => {
    expect(backdropFor("/dashboard/")).toBe("sky");
    expect(backdropFor("/dashboard//")).toBe("sky");
    expect(backdropFor("//")).toBe("sky");
  });

  it("keeps every other page plain", () => {
    expect(backdropFor("/courses")).toBe("plain");
    expect(backdropFor("/dashboard/extra")).toBe("plain");
    expect(backdropFor("/settings/")).toBe("plain");
  });
});

describe("backdropClassName", () => {
  it("paints the sky on a sky page", () => {
    expect(backdropClassName("/")).toBe("bg-sky");
  });

  it("paints the theme background elsewhere", () => {
    expect(backdropClassName("/courses")).toBe("bg-background");
  });
});
