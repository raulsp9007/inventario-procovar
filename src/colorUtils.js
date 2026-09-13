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

export function productChipColors(hex) {
  const base = hex || "#8A8574";
  return {
    bg: withAlpha(base, 0.08),
    border: withAlpha(base, 0.32),
    text: darken(base, 0.15),
  };
}
