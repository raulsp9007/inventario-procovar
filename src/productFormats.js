import { priceToCUP } from "./money";

// Formatos de venta de un producto (cómo viene empacado). El precio del
// producto es el del formato completo; la unidad sale de dividirlo entre
// `units`. No cambia pedidos, totales ni ingresos: es informativo.
// Antes era una lista fija (esta misma, hardcodeada); ahora es editable
// desde Configuración y se guarda en el estado (useInventoryStore.js,
// campo `productFormats`) -- este archivo se queda solo con la semilla para
// la migración y las funciones puras que la usan.
export const DEFAULT_PRODUCT_FORMATS = [
  { code: "sixpack", units: 6 },
  { code: "paca12u", units: 12 },
  { code: "paca48u", units: 48 },
  { code: "saco25kg", units: 55 },
  { code: "paca10kg", units: 10 },
  { code: "caja24u", units: 24 },
  { code: "caja12u", units: 12 },
];

// Migración única (datos guardados antes de que esto fuera editable): arranca
// de la lista de siempre, y de yapa agrega cualquier formato que algún
// producto ya tenga puesto y no esté en esa lista -- no debería pasar (antes
// solo se podía elegir de ahí), pero así ningún producto se queda mudo si el
// dato viene de un backup viejo o raro. Los agregados de esta segunda forma
// arrancan en 1 unidad (no hay de dónde sacar el número real).
export function buildInitialProductFormats(products) {
  const seeded = [...DEFAULT_PRODUCT_FORMATS];
  const codes = new Set(seeded.map((f) => f.code));
  (products || []).forEach((p) => {
    if (p.format && !codes.has(p.format)) {
      codes.add(p.format);
      seeded.push({ code: p.format, units: 1 });
    }
  });
  return seeded;
}

export function getFormat(formats, code) {
  return (formats || []).find((f) => f.code === code) || null;
}

// Precio por unidad de un producto con formato. `price` es el precio guardado
// (USD si hay tasa cargada, CUP directo si no -- misma regla que priceToCUP).
// null si no hay formato o no hay precio que dividir.
export function unitPrice(formats, price, formatCode, exchangeRate) {
  const format = getFormat(formats, formatCode);
  const n = Number(price) || 0;
  if (!format || n <= 0) return null;
  const hasRate = !!exchangeRate && exchangeRate > 0;
  return {
    units: format.units,
    usd: hasRate ? n / format.units : null,
    cup: priceToCUP(n, exchangeRate) / format.units,
  };
}

function normalizedCode(code) {
  return (code || "").trim();
}

// Alta o edición de unidades -- mismo código ya existente = se le cambia
// `units` en el lugar (permite corregir un formato sin borrarlo y perder la
// referencia en los productos que ya lo usan). Código nuevo = se agrega al
// final. Nunca lanza: devuelve la lista sin tocar + un mensaje de error si
// el dato no sirve, para que quien llama decida cómo avisar.
export function upsertProductFormat(formats, { code, units }) {
  const trimmed = normalizedCode(code);
  const parsedUnits = parseInt(units, 10);
  if (!trimmed) return { formats, error: "Ponle un nombre al formato." };
  if (!Number.isFinite(parsedUnits) || parsedUnits < 1) {
    return { formats, error: "Las unidades tienen que ser un número mayor que 0." };
  }
  const idx = formats.findIndex((f) => f.code.toLowerCase() === trimmed.toLowerCase());
  if (idx === -1) {
    return { formats: [...formats, { code: trimmed, units: parsedUnits }], error: null };
  }
  // Mismo nombre exacto (puede diferir solo en mayúsculas de uno ya
  // guardado) -- se actualiza ESE, no se duplica.
  const next = formats.map((f, i) => (i === idx ? { ...f, units: parsedUnits } : f));
  return { formats: next, error: null };
}

// No deja borrar un formato que algún producto activo o archivado todavía
// tiene puesto -- si no, ese producto se queda con un `format` que ya no
// aparece en ningún lado (el desplegable lo perdería silenciosamente).
export function removeProductFormat(formats, code, products) {
  const inUse = (products || []).filter((p) => p.format === code);
  if (inUse.length > 0) {
    const names = inUse.map((p) => p.name).join(", ");
    return {
      formats,
      error: `No se puede eliminar: ${inUse.length} producto${inUse.length === 1 ? "" : "s"} lo está${inUse.length === 1 ? "" : "n"} usando (${names}). Cámbiale el formato primero.`,
    };
  }
  return { formats: formats.filter((f) => f.code !== code), error: null };
}
