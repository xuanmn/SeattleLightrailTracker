import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const STYLE_FILES = [
  "theme.css",
  "layout.css",
  "board.css",
  "modal.css",
  "picker.css",
  "settings.css",
  "map.css",
  "faq.css",
];

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

  it("excludes lazy modal-only rules from critical-path layout.css and board.css", () => {
    const layoutCss = readFileSync(`${process.cwd()}/src/styles/layout.css`, "utf-8");
    const boardCss = readFileSync(`${process.cwd()}/src/styles/board.css`, "utf-8");

    expect(layoutCss).not.toMatch(/\.modal-overlay\b|\.settings-row\b|\.toggle-switch\b|\.picker-search-wrap\b/);
    expect(boardCss).not.toMatch(/\.picker-station-row\b|\.picker-add-btn\b|\.picker-filter-pills\b/);
  });

  it("defers content-visibility: auto only on below-the-fold station cards", () => {
    const boardCss = readFileSync(`${process.cwd()}/src/styles/board.css`, "utf-8");

    // Base .station-card rule must not force content-visibility: auto on above-the-fold LCP cards
    const baseStationCardBlock = boardCss.match(/\.station-card\s*\{[^}]*\}/)?.[0] ?? "";
    expect(baseStationCardBlock).not.toContain("content-visibility: auto");

    // Below-the-fold station cards receive content-visibility: auto with intrinsic block size only
    expect(boardCss).toMatch(/\.station-card:nth-child\(n\s*\+\s*5\)\s*\{[^}]*content-visibility:\s*auto/);
    expect(boardCss).toContain("contain-intrinsic-size: auto none auto 280px");
  });
});
