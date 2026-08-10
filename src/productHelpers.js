export const PRODUCT_COLOR_PALETTE = [
  "#C77A2E", "#274E37", "#6B4C9A", "#2E6E8A", "#8A2E5E", "#4C7A2E",
];

const DIACRITICS_REGEX = new RegExp("[\\u0300-\\u036f]", "g");

export function slugifyProductName(name) {
  const base = name
    .normalize("NFD")
    .replace(DIACRITICS_REGEX, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return base || "PROD";
}

export function generateProductCode(name, existingCodes) {
  const base = slugifyProductName(name);
  if (!existingCodes.includes(base)) return base;
  let suffix = 2;
  while (existingCodes.includes(`${base}${suffix}`)) suffix += 1;
  return `${base}${suffix}`;
}

export function nextProductColor(existingCount) {
  return PRODUCT_COLOR_PALETTE[existingCount % PRODUCT_COLOR_PALETTE.length];
}
