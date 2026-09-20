import { priceToCUP } from "./money";

// Formatos de venta de un producto (cómo viene empacado). El precio del
// producto es el del formato completo; la unidad sale de dividirlo entre
// `units`. No cambia pedidos, totales ni ingresos: es informativo.
export const FORMAT_OPTIONS = [
  { code: "sixpack", units: 6 },
  { code: "paca12u", units: 12 },
  { code: "paca48u", units: 48 },
  { code: "saco25kg", units: 55 },
  { code: "paca10kg", units: 10 },
  { code: "caja24u", units: 24 },
  { code: "caja12u", units: 12 },
];

export function getFormat(code) {
  return FORMAT_OPTIONS.find((f) => f.code === code) || null;
}

// Precio por unidad de un producto con formato. `price` es el precio guardado
// (USD si hay tasa cargada, CUP directo si no -- misma regla que priceToCUP).
// null si no hay formato o no hay precio que dividir.
export function unitPrice(price, formatCode, exchangeRate) {
  const format = getFormat(formatCode);
  const n = Number(price) || 0;
  if (!format || n <= 0) return null;
  const hasRate = !!exchangeRate && exchangeRate > 0;
  return {
    units: format.units,
    usd: hasRate ? n / format.units : null,
    cup: priceToCUP(n, exchangeRate) / format.units,
  };
}
