import { toCubanPhone, getCustomerStats } from "./customerHelpers";

// Registro de clientes propio: [{ id, name, businessName, phone, createdAt }].
// Antes un "cliente" era solo el texto customerName repetido en los
// movimientos -- borrar el último pedido o pasar el tope de movimientos lo
// hacía desaparecer con su teléfono y negocio. Acá vive aparte, así que solo
// se va si se elimina a propósito. `name` es la misma cadena exacta que se
// guarda en customerName de cada movimiento (así se enlazan sus pedidos).
// `phone` va como en los movimientos: "53" + 8 dígitos.

const MANUAL_SALE_NAME = "Venta manual";

function newCustomerId() {
  return `cust-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// Migración única: arma el registro desde los movimientos ya guardados, con
// el negocio y el teléfono más recientes de cada cliente. "Venta manual" no
// es un cliente, es un ajuste de conteo.
export function buildRegistryFromMovements(movements) {
  const byName = new Map();
  movements.forEach((m) => {
    if (!m.customerName || m.customerName === MANUAL_SALE_NAME) return;
    const ts = m.timestamp || "";
    if (!byName.has(m.customerName)) {
      byName.set(m.customerName, { name: m.customerName, businessName: "", businessTs: "", phone: "", phoneTs: "", createdAt: ts });
    }
    const entry = byName.get(m.customerName);
    if (ts && (!entry.createdAt || ts < entry.createdAt)) entry.createdAt = ts;
    if (m.businessName && ts >= entry.businessTs) {
      entry.businessName = m.businessName;
      entry.businessTs = ts;
    }
    if (m.customerPhone && ts >= entry.phoneTs) {
      entry.phone = m.customerPhone;
      entry.phoneTs = ts;
    }
  });
  return Array.from(byName.values())
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((e) => ({ id: newCustomerId(), name: e.name, businessName: e.businessName, phone: e.phone, createdAt: e.createdAt || new Date().toISOString() }));
}

// Alta o actualización "suave": un dato vacío no borra el que ya está
// guardado (un pedido sin teléfono no le quita el teléfono al cliente).
export function upsertCustomer(customers, { name, businessName, phone }) {
  if (!name || name === MANUAL_SALE_NAME) return customers;
  const cleanBusiness = (businessName || "").trim();
  const cleanPhone = phone ? toCubanPhone(phone) : "";
  const idx = customers.findIndex((c) => c.name === name);
  if (idx === -1) {
    return [...customers, { id: newCustomerId(), name, businessName: cleanBusiness, phone: cleanPhone, createdAt: new Date().toISOString() }];
  }
  const current = customers[idx];
  const next = { ...current, businessName: cleanBusiness || current.businessName, phone: cleanPhone || current.phone };
  if (next.businessName === current.businessName && next.phone === current.phone) return customers;
  return customers.map((c, i) => (i === idx ? next : c));
}

// Cambio explícito de campos: lo que viene definido pisa lo guardado, aunque
// sea vacío (así se puede borrar un teléfono). Lo no incluido no se toca.
// Crea al cliente si todavía no estaba.
export function patchCustomer(customers, name, { businessName, phone }) {
  if (!name || name === MANUAL_SALE_NAME) return customers;
  const idx = customers.findIndex((c) => c.name === name);
  const base = idx === -1
    ? { id: newCustomerId(), name, businessName: "", phone: "", createdAt: new Date().toISOString() }
    : customers[idx];
  const next = {
    ...base,
    businessName: businessName === undefined ? base.businessName : businessName.trim(),
    phone: phone === undefined ? base.phone : (phone ? toCubanPhone(phone) : ""),
  };
  if (idx === -1) return [...customers, next];
  return customers.map((c, i) => (i === idx ? next : c));
}

// Renombra y/o edita negocio y teléfono. Si el nombre nuevo ya es de OTRO
// cliente, los fusiona en ese (conserva su id). `phone` undefined = no tocar.
export function renameCustomer(customers, oldName, newName, businessName, phone) {
  const name = (newName || "").trim() || oldName;
  const business = (businessName || "").trim();
  const nextPhone = phone === undefined ? undefined : (phone ? toCubanPhone(phone) : "");
  const old = customers.find((c) => c.name === oldName);
  if (!old) return patchCustomer(customers, name, { businessName: business, phone: nextPhone });

  const target = name !== oldName ? customers.find((c) => c.name === name) : null;
  if (target) {
    const merged = {
      ...target,
      businessName: business,
      phone: nextPhone !== undefined ? nextPhone : (target.phone || old.phone),
      createdAt: old.createdAt && old.createdAt < target.createdAt ? old.createdAt : target.createdAt,
    };
    return customers.filter((c) => c.name !== oldName).map((c) => (c.name === name ? merged : c));
  }
  return customers.map((c) => (
    c.name === oldName
      ? { ...c, name, businessName: business, phone: nextPhone !== undefined ? nextPhone : c.phone }
      : c
  ));
}

export function removeCustomer(customers, name) {
  return customers.filter((c) => c.name !== name);
}

export function registryNames(customers) {
  return customers.map((c) => c.name);
}

export function findRegistryCustomer(customers, name) {
  return customers.find((c) => c.name === name) || null;
}

export function registryBusinessNames(customers) {
  return Array.from(new Set(customers.map((c) => c.businessName).filter(Boolean)));
}

export function registryCustomerNameForBusiness(customers, businessName) {
  const match = customers.find((c) => c.businessName === businessName);
  return match ? match.name : "";
}

// Filas de la pestaña Clientes: todos los del registro, con las estadísticas
// que salen de los movimientos (favorito, última compra). Uno sin pedidos
// sigue en la lista, con lastPurchaseDate vacío y hasOrders en false.
export function getRegistryStats(customers, movements, products) {
  const statsByName = new Map(getCustomerStats(movements, products).map((s) => [s.customerName, s]));
  return customers.map((c) => {
    const stat = statsByName.get(c.name);
    return {
      id: c.id,
      customerName: c.name,
      businessName: c.businessName || "",
      phone: c.phone || "",
      hasOrders: !!stat,
      favoriteProductCode: stat ? stat.favoriteProductCode : null,
      lastPurchaseDate: stat ? stat.lastPurchaseDate : "",
    };
  });
}

function vcfEscape(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// Contactos para importar en la agenda del teléfono -- solo los que tienen
// teléfono (una tarjeta sin número no sirve en la agenda).
export function buildVcf(customers) {
  const withPhone = customers.filter((c) => c.phone);
  if (withPhone.length === 0) return "";
  return withPhone
    .map((c) => [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${vcfEscape(c.name)}`,
      `N:${vcfEscape(c.name)};;;;`,
      ...(c.businessName ? [`ORG:${vcfEscape(c.businessName)}`] : []),
      `TEL;TYPE=CELL:+${c.phone.replace(/\D/g, "")}`,
      "END:VCARD",
    ].join("\r\n"))
    .join("\r\n") + "\r\n";
}
