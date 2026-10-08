import { describe, it, expect } from "vitest";
import { productChipColors } from "./colorUtils";

// Etiquetas de producto en Pedidos: el texto sale del color del producto pero
// tiene que leerse (contraste >= 4.5) sobre el fondo suave de la etiqueta, en
// modo claro (se oscurece) y en oscuro (se aclara), sea cual sea el color.

const SURFACE = { light: "#FFFFFF", dark: "#24271F" };

function rgb(hex) {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex) {
  const [r, g, b] = rgb(hex).map((v) => v / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Fondo real de la etiqueta: el color del producto al 8% sobre la tarjeta.
function chipBackground(base, surface) {
  const a = 0.08;
  const [r, g, b] = rgb(base).map((v, i) => Math.round(v * a + rgb(surface)[i] * (1 - a)));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

const COLORS = {
  naranja: "#C77A2E", amarillo: "#E0A040", amarilloClaro: "#F2D13B", verdeOscuro: "#274E37",
  morado: "#6B4C9A", rojo: "#B23A3A", gris: "#8A8A6A", negro: "#111111", blanco: "#FFFFFF", azulOscuro: "#1B2A5A",
};

describe("productChipColors", () => {
  for (const theme of ["light", "dark"]) {
    for (const [name, hex] of Object.entries(COLORS)) {
      it(`${name}: el texto llega a 4.5 en modo ${theme}`, () => {
        const { text } = productChipColors(hex, theme);
        expect(contrast(text, chipBackground(hex, SURFACE[theme]))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("en modo claro un color ya legible solo se oscurece un poco, como siempre", () => {
    // El morado ya contrasta: se queda con el oscurecido de 15% de antes.
    const { text } = productChipColors("#6B4C9A", "light");
    expect(text).toBe("#5b4183");
  });

  it("en modo claro un color claro se oscurece más para leerse", () => {
    const amarillo = productChipColors("#F2D13B", "light").text;
    expect(luminance(amarillo)).toBeLessThan(luminance("#F2D13B") * 0.5);
  });

  it("en modo oscuro un color oscuro se aclara", () => {
    const { text } = productChipColors("#274E37", "dark");
    expect(luminance(text)).toBeGreaterThan(luminance("#274E37"));
  });

  it("sin color usa el gris de siempre y sin tema se comporta como modo claro", () => {
    expect(productChipColors(undefined).text).toBe(productChipColors("#8A8574", "light").text);
    expect(productChipColors("#6B4C9A").text).toBe(productChipColors("#6B4C9A", "light").text);
  });

  it("el fondo y el borde no cambian con el tema", () => {
    expect(productChipColors("#C77A2E", "dark").bg).toBe(productChipColors("#C77A2E", "light").bg);
    expect(productChipColors("#C77A2E", "dark").border).toBe(productChipColors("#C77A2E", "light").border);
  });
});
