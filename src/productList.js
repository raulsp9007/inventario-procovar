import { generateProductCode, nextProductColor } from "./productHelpers";

// Exportar/importar la lista de productos eligiendo qué datos mover. El nombre
// va siempre (es la llave para reconocer un producto); lo demás es opcional:
// precio (USD), cantidad, foto y formato. No toca pedidos, clientes ni historial.
// Funciones puras: la pantalla (ProductListCard) solo las llama y muestra.

export const LIST_KIND = "procovar-productos";
export const LIST_VERSION = 1;
export const LIST_FIELDS = ["precio", "cantidad", "foto", "formato"];

const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

// Dos nombres son "el mismo producto" aunque cambien mayúsculas, tildes o espacios.
export function normalizeProductName(name) {
  return String(name || "").normalize("NFD").replace(DIACRITICS, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const hasRate = (exchangeRate) => !!exchangeRate && exchangeRate > 0;

// Los datos que se pueden mover de verdad: sin tasa de conversión el precio
// guardado no es USD, así que no se exporta ni se importa.
function usableFields(fields, exchangeRate) {
  return LIST_FIELDS.filter((f) => (fields || []).includes(f) && (f !== "precio" || hasRate(exchangeRate)));
}

// Arma el contenido del archivo. `getPhoto(code)` devuelve { type, data } (data
// en base64) o null: se inyecta para no depender del almacén de imágenes.
export async function buildProductListExport({ products, prices, stock, productFormats, exchangeRate, fields, getPhoto, now }) {
  const chosen = usableFields(fields, exchangeRate);
  const active = (products || []).filter((p) => !p.archived);
  const rows = [];
  for (const p of active) {
    const row = { nombre: p.name };
    if (chosen.includes("precio")) row.precio = Number(prices?.[p.code]) || 0;
    if (chosen.includes("cantidad")) row.cantidad = Number(stock?.[p.code]) || 0;
    if (chosen.includes("formato") && p.format) row.formato = p.format;
    if (chosen.includes("foto") && getPhoto) {
      const photo = await getPhoto(p.code);
      if (photo) row.foto = { type: photo.type, data: photo.data };
    }
    rows.push(row);
  }
  const out = { kind: LIST_KIND, version: LIST_VERSION, exportedAt: now || new Date().toISOString(), fields: chosen, products: rows };
  if (chosen.includes("formato")) {
    const used = new Set(rows.map((r) => r.formato).filter(Boolean));
    out.formats = (productFormats || []).filter((f) => used.has(f.code)).map((f) => ({ code: f.code, units: f.units }));
  }
  return out;
}

const cleanName = (value) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");

function cleanNumber(value, { integer = false } = {}) {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
  return integer ? Math.round(n) : n;
}

function cleanPhoto(value) {
  if (!value || typeof value.type !== "string" || !value.type.startsWith("image/")) return null;
  if (typeof value.data !== "string" || !value.data) return null;
  return { type: value.type, data: value.data };
}

// Lee el texto de un archivo. Lanza Error con un mensaje listo para mostrar.
export function parseProductList(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("El archivo no es una lista de productos válida.");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.kind !== LIST_KIND) {
    throw new Error("Este archivo no es una lista de productos de Procovar.");
  }
  if (!(raw.version <= LIST_VERSION)) throw new Error("Este archivo es de una versión más nueva de la app.");
  const fields = LIST_FIELDS.filter((f) => Array.isArray(raw.fields) && raw.fields.includes(f));
  const products = [];
  (Array.isArray(raw.products) ? raw.products : []).forEach((item) => {
    const nombre = cleanName(item && item.nombre);
    if (!nombre) return;
    const row = { nombre };
    if (fields.includes("precio")) {
      const v = cleanNumber(item.precio);
      if (v != null) row.precio = v;
    }
    if (fields.includes("cantidad")) {
      const v = cleanNumber(item.cantidad, { integer: true });
      if (v != null) row.cantidad = v;
    }
    if (fields.includes("formato")) {
      const v = cleanName(item.formato);
      if (v) row.formato = v;
    }
    if (fields.includes("foto")) {
      const v = cleanPhoto(item.foto);
      if (v) row.foto = v;
    }
    products.push(row);
  });
  if (products.length === 0) throw new Error("El archivo no trae productos.");
  const formats = (Array.isArray(raw.formats) ? raw.formats : [])
    .map((f) => ({ code: cleanName(f && f.code), units: parseInt(f && f.units, 10) }))
    .filter((f) => f.code && Number.isFinite(f.units) && f.units >= 1);
  return { exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : null, fields, formats, products };
}

// Qué pasaría al importar, sin tocar nada: filas con su estado y cambios, los
// datos nuevos ya calculados (para aplicarlos tal cual) y avisos. Los
// productos archivados no cuentan como existentes.
//   existing: "nuevos" (solo agrega) | "actualizar" (también actualiza los que ya hay)
//   qty: "reemplazar" (el stock queda como el archivo) | "sumar"
export function planProductImport({ products, prices, stock, productFormats, exchangeRate, parsed, fields, existing, qty }) {
  const chosen = usableFields(fields, exchangeRate).filter((f) => parsed.fields.includes(f));
  const nextProducts = products.map((p) => ({ ...p }));
  const nextPrices = { ...prices };
  const nextStock = { ...stock };
  const nextFormats = productFormats.map((f) => ({ ...f }));
  const stockDiffs = [];
  const photos = [];
  const warnings = [];
  const rows = [];
  const counts = { nuevos: 0, actualizan: 0, iguales: 0, existentes: 0 };
  const seen = new Set();
  let duplicates = 0;
  let createdWithoutHl = false;

  // Deja el formato disponible (lo agrega con sus unidades si el archivo las trae).
  function resolveFormat(code, name) {
    if (nextFormats.some((f) => f.code === code)) return code;
    const fromFile = parsed.formats.find((f) => f.code === code);
    if (fromFile) {
      nextFormats.push({ code: fromFile.code, units: fromFile.units });
      return code;
    }
    warnings.push(`El formato "${code}" de ${name} no existe en la app y el archivo no trae sus unidades: se omitió.`);
    return null;
  }

  function applyStock(code, current, incoming) {
    const target = qty === "sumar" ? current + incoming : incoming;
    nextStock[code] = target;
    if (target !== current) stockDiffs.push({ code, diff: target - current });
    return target;
  }

  parsed.products.forEach((item) => {
    const key = normalizeProductName(item.nombre);
    if (seen.has(key)) {
      duplicates += 1;
      return;
    }
    seen.add(key);
    const match = nextProducts.find((p) => !p.archived && normalizeProductName(p.name) === key);

    if (!match) {
      const code = generateProductCode(item.nombre, nextProducts.map((p) => p.code));
      const product = { code, name: item.nombre, short: item.nombre, color: nextProductColor(nextProducts.length) };
      const changes = [];
      nextPrices[code] = 0;
      nextStock[code] = 0;
      if (chosen.includes("formato") && item.formato) {
        const format = resolveFormat(item.formato, item.nombre);
        if (format) { product.format = format; changes.push({ field: "formato", from: null, to: format }); }
      }
      if (chosen.includes("precio") && item.precio != null) {
        nextPrices[code] = item.precio;
        changes.push({ field: "precio", from: null, to: item.precio });
      }
      nextProducts.push(product);
      if (chosen.includes("cantidad") && item.cantidad != null) {
        applyStock(code, 0, item.cantidad);
        changes.push({ field: "cantidad", from: null, to: item.cantidad });
      }
      if (chosen.includes("foto") && item.foto) {
        photos.push({ code, type: item.foto.type, data: item.foto.data });
        changes.push({ field: "foto" });
      }
      createdWithoutHl = true;
      counts.nuevos += 1;
      rows.push({ name: item.nombre, status: "nuevo", changes });
      return;
    }

    if (existing !== "actualizar") {
      counts.existentes += 1;
      rows.push({ name: item.nombre, status: "existe", changes: [] });
      return;
    }

    const changes = [];
    const code = match.code;
    if (chosen.includes("precio") && item.precio != null && item.precio !== (Number(nextPrices[code]) || 0)) {
      changes.push({ field: "precio", from: Number(nextPrices[code]) || 0, to: item.precio });
      nextPrices[code] = item.precio;
    }
    if (chosen.includes("cantidad") && item.cantidad != null) {
      const current = Number(nextStock[code]) || 0;
      const target = qty === "sumar" ? current + item.cantidad : item.cantidad;
      if (target !== current) {
        changes.push({ field: "cantidad", from: current, to: target });
        applyStock(code, current, item.cantidad);
      }
    }
    if (chosen.includes("formato") && item.formato && item.formato !== match.format) {
      const format = resolveFormat(item.formato, item.nombre);
      if (format) {
        changes.push({ field: "formato", from: match.format || null, to: format });
        match.format = format;
      }
    }
    if (chosen.includes("foto") && item.foto) {
      photos.push({ code, type: item.foto.type, data: item.foto.data });
      changes.push({ field: "foto" });
    }
    if (changes.length > 0) {
      counts.actualizan += 1;
      rows.push({ name: item.nombre, status: "actualiza", changes });
    } else {
      counts.iguales += 1;
      rows.push({ name: item.nombre, status: "igual", changes: [] });
    }
  });

  if (duplicates > 0) warnings.push(`${duplicates} nombre${duplicates === 1 ? "" : "s"} repetido${duplicates === 1 ? "" : "s"} en el archivo: se usó solo el primero.`);
  if (createdWithoutHl) warnings.push("Los productos nuevos quedan sin HL por unidad; ajústalo en Productos.");

  return { rows, counts, warnings, nextProducts, nextPrices, nextStock, nextFormats, stockDiffs, photos };
}
