import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync("src/theme.css", "utf8");

// Modo oscuro: los textos secundarios tienen que leerse (contraste WCAG) sobre
// los fondos donde se usan. Texto de lectura >= 4.5; lo decorativo (números de
// orden, separadores con texto) >= 3.

function block(selector) {
  const start = css.indexOf(selector);
  const open = css.indexOf("{", start);
  const close = css.indexOf("\n}", open);
  const vars = {};
  for (const m of css.slice(open + 1, close).matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) vars[m[1]] = m[2];
  return vars;
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const dark = block('\n[data-theme="dark"] {');
const BACKGROUNDS = ["bg", "surface", "panel-alt"];

describe("modo oscuro: contraste de textos secundarios", () => {
  for (const token of ["text-muted", "text-faint", "muted", "faint"]) {
    for (const bg of BACKGROUNDS) {
      it(`--${token} sobre --${bg} llega a 4.5`, () => {
        expect(contrast(dark[token], dark[bg])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  for (const token of ["text-faint-2", "faintest"]) {
    for (const bg of BACKGROUNDS) {
      it(`--${token} (decorativo) sobre --${bg} llega a 3`, () => {
        expect(contrast(dark[token], dark[bg])).toBeGreaterThanOrEqual(3);
      });
    }
  }

  it("los textos de la cabecera oscura (sobre --ink) llegan a 4.5", () => {
    expect(contrast(dark["on-ink-subtitle"], dark.ink)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dark["on-ink-label"], dark.ink)).toBeGreaterThanOrEqual(4.5);
  });

  it("la jerarquía se mantiene: muted más claro que faint, y faint más claro que faintest", () => {
    expect(luminance(dark.muted)).toBeGreaterThan(luminance(dark.faint));
    expect(luminance(dark.faint)).toBeGreaterThan(luminance(dark.faintest));
  });
});
