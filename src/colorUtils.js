// Chips de producto (Pedidos): se derivan del color propio del producto en
// vez de usar hex fijos -- fondo muy suave, borde más marcado, texto
// oscurecido para que siga siendo legible sobre el fondo suave. Un solo
// lugar para este cálculo en vez de repetirlo a mano por chip.
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
}

function withAlpha(hex, alpha01) {
  const alphaHex = Math.round(alpha01 * 255).toString(16).padStart(2, "0");
  return `${hex}${alphaHex}`;
}

function darken(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const factor = 1 - amount;
  return rgbToHex(r * factor, g * factor, b * factor);
}

function lighten(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
}

function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const [lr, lg, lb] = [r, g, b].map((v) => v / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Color de la tarjeta donde va la etiqueta (--surface de theme.css).
const SURFACE = { light: "#FFFFFF", dark: "#24271F" };
const BG_ALPHA = 0.08;
const MIN_CONTRAST = 4.5;

// Fondo real de la etiqueta: el color del producto al 8% sobre la tarjeta.
function blendOver(hex, surfaceHex, alpha) {
  const c = hexToRgb(hex);
  const s = hexToRgb(surfaceHex);
  return rgbToHex(c.r * alpha + s.r * (1 - alpha), c.g * alpha + s.g * (1 - alpha), c.b * alpha + s.b * (1 - alpha));
}

// Texto de la etiqueta: parte del color del producto y lo mueve (oscurece en
// modo claro, aclara en oscuro) hasta que se lea sobre el fondo suave, sea
// cual sea el color. En claro siempre se oscurece al menos 15%.
function chipTextColor(base, theme) {
  const surface = theme === "dark" ? SURFACE.dark : SURFACE.light;
  const chipBg = blendOver(base, surface, BG_ALPHA);
  const move = theme === "dark" ? lighten : darken;
  const start = theme === "dark" ? 0 : 0.15;
  let amount = start;
  let text = move(base, amount);
  while (contrast(text, chipBg) < MIN_CONTRAST && amount < 1) {
    amount = Math.min(1, amount + 0.05);
    text = move(base, amount);
  }
  return text;
}

export function productChipColors(hex, theme = "light") {
  const base = hex || "#8A8574";
  return {
    bg: withAlpha(base, BG_ALPHA),
    border: withAlpha(base, 0.32),
    text: chipTextColor(base, theme),
  };
}
