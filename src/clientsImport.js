import { parseCsv } from "./csv";
import { toCubanPhone } from "./customerHelpers";
import { normalizeProductName as normalizeName } from "./productList";

// Importar clientes desde un CSV (la lista de clientes del portal). Mapa:
//   Nombre Contacto → name (la persona; es la llave que une sus pedidos)
//   Nombre Cliente  → businessName (su negocio)
//   Telefono        → phone ("53" + 8 dígitos)
//   Codigo, Dirección, Tipo Cliente, Tipo Consumo → code, address, clientType, consumptionType
// Funciones puras: la pantalla (ClientsImportCard) solo las llama y muestra.

const COLUMN_ALIASES = {
  name: ["nombre contacto", "contacto"],
  businessName: ["nombre cliente"],
  code: ["codigo", "código"],
  address: ["direccion", "dirección"],
  clientType: ["tipo cliente"],
  consumptionType: ["tipo consumo"],
  phone: ["telefono", "teléfono", "tel"],
};

const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");
const headerKey = (text) => String(text || "").normalize("NFD").replace(DIACRITICS, "").toLowerCase().replace(/\s+/g, " ").trim();
const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
const plural = (n, one, many) => (n === 1 ? one : many);

// Dirección en una sola línea (en el portal vienen con saltos de línea).
const cleanAddress = (value) => String(value || "").split(/\r?\n/).map(clean).filter(Boolean).join(", ");

// Los 8 dígitos locales de un teléfono cubano, o "" si no sirve.
function localPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 8) return digits;
  if (digits.length === 10 && digits.startsWith("53")) return digits.slice(2);
  return "";
}

// Lee el texto de un CSV. Lanza Error con un mensaje listo para mostrar.
export function parseClientsCsv(text) {
  const table = parseCsv(text);
  if (table.length === 0) throw new Error("El archivo está vacío.");

  const header = table[0].map(headerKey);
  const index = {};
  Object.entries(COLUMN_ALIASES).forEach(([field, aliases]) => {
    const position = header.findIndex((h) => aliases.map(headerKey).includes(h));
    if (position >= 0) index[field] = position;
  });
  if (index.name === undefined && index.businessName === undefined) {
    throw new Error("El archivo no tiene las columnas esperadas (Nombre Contacto o Nombre Cliente).");
  }
  if (table.length === 1) throw new Error("El archivo no trae clientes.");

  const cell = (row, field) => (index[field] === undefined ? "" : row[index[field]] || "");
  const rows = [];
  const seen = new Set();
  let withoutName = 0;
  let duplicates = 0;
  let badPhones = 0;

  table.slice(1).forEach((row) => {
    const contact = clean(cell(row, "name"));
    const business = clean(cell(row, "businessName"));
    const name = contact || business;
    if (!name) {
      withoutName += 1;
      return;
    }
    const key = normalizeName(name);
    if (seen.has(key)) {
      duplicates += 1;
      return;
    }
    seen.add(key);
    const rawPhone = cell(row, "phone");
    const phone = localPhone(rawPhone);
    if (rawPhone.replace(/\D/g, "") && !phone) badPhones += 1;
    rows.push({
      name,
      businessName: normalizeName(business) === key ? "" : business,
      phone,
      code: clean(cell(row, "code")),
      address: cleanAddress(cell(row, "address")),
      clientType: clean(cell(row, "clientType")),
      consumptionType: clean(cell(row, "consumptionType")),
    });
  });

  const warnings = [];
  if (withoutName > 0) warnings.push(`${withoutName} ${plural(withoutName, "fila sin nombre se omitió", "filas sin nombre se omitieron")}.`);
  if (duplicates > 0) warnings.push(`${duplicates} ${plural(duplicates, "nombre repetido", "nombres repetidos")} en el archivo: se usó solo el primero de cada uno.`);
  if (badPhones > 0) warnings.push(`${badPhones} ${plural(badPhones, "teléfono incompleto", "teléfonos incompletos")} no se ${plural(badPhones, "importó", "importaron")}.`);
  if (rows.length === 0) throw new Error("El archivo no trae clientes.");

  return { rows, warnings, total: table.length - 1 };
}

const FIELDS = ["businessName", "phone", "code", "address", "clientType", "consumptionType"];
const emptyValue = (value) => !value;

function incomingValue(field, row) {
  return field === "phone" ? (row.phone ? toCubanPhone(row.phone) : "") : row[field] || "";
}

// Qué pasaría al importar, sin tocar nada.
//   mode "nuevos"     → solo agrega los clientes que no estaban
//   mode "completar"  → además rellena lo que a los existentes les falta
//   mode "actualizar" → además pisa lo guardado con lo del archivo (si el archivo lo trae)
// Un cliente existente se reconoce por su código o por su nombre (sin importar
// mayúsculas ni tildes). Nunca se cambia el nombre de uno existente: es lo que
// une sus pedidos.
export function planClientsImport({ customers, parsed, mode, newId, nowIso }) {
  const nextCustomers = customers.map((c) => ({ ...c }));
  const rows = [];
  const counts = { nuevos: 0, actualizan: 0, iguales: 0, existentes: 0 };

  parsed.rows.forEach((row) => {
    const key = normalizeName(row.name);
    const match = nextCustomers.find((c) => (row.code && c.code === row.code) || normalizeName(c.name) === key);

    if (!match) {
      const created = { id: newId(), name: row.name, businessName: row.businessName, phone: incomingValue("phone", row), createdAt: nowIso };
      ["code", "address", "clientType", "consumptionType"].forEach((field) => {
        if (row[field]) created[field] = row[field];
      });
      nextCustomers.push(created);
      counts.nuevos += 1;
      rows.push({ name: row.name, status: "nuevo", changes: [] });
      return;
    }

    // De acá en adelante es un cliente que ya estaba: se muestra con su nombre guardado.
    if (mode === "nuevos") {
      counts.existentes += 1;
      rows.push({ name: match.name, status: "existe", changes: [] });
      return;
    }

    const changes = [];
    FIELDS.forEach((field) => {
      const incoming = incomingValue(field, row);
      const current = match[field] || "";
      if (!incoming || incoming === current) return;
      if (mode === "completar" && !emptyValue(current)) return;
      changes.push({ field, from: current, to: incoming });
      match[field] = incoming;
    });
    if (changes.length > 0) {
      counts.actualizan += 1;
      rows.push({ name: match.name, status: mode === "completar" ? "completa" : "actualiza", changes });
    } else {
      counts.iguales += 1;
      rows.push({ name: match.name, status: "igual", changes: [] });
    }
  });

  return { rows, counts, nextCustomers };
}
