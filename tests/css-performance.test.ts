import { describe, expect, it } from "vitest";
// @ts-ignore - node builtin available in the vitest runtime
import { readFileSync } from "node:fs";

declare const process: { cwd(): string };

const STYLE_FILES = ["theme.css", "layout.css", "board.css", "map.css", "faq.css"];

describe("CSS rendering performance", () => {
  it.each(STYLE_FILES)("%s never uses `transition: all` (transitions must list explicit properties)", (file) => {
    const css: string = readFileSync(`${process.cwd()}/src/styles/${file}`, "utf-8");
    expect(css).not.toMatch(/transition:\s*all\b/);
  });

  it.each(STYLE_FILES)("%s never transitions layout-triggering properties like font-weight or width", (file) => {
    const css: string = readFileSync(`${process.cwd()}/src/styles/${file}`, "utf-8");
    const transitions = [...css.matchAll(/transition:\s*([^;]+);/g)].map((m) => m[1]);
    for (const value of transitions) {
      expect(value).not.toMatch(/\b(font-weight|width|height|padding|margin)\b/);
    }
  });
});
