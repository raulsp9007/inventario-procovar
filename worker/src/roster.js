// La lista de personas con acceso al buzón = los usuarios del secreto USERS (rol
// admin, facturadora y los vendedores de siempre) + los vendedores que el
// administrador maneja desde el sitio (viven en la base). Lo de la base gana sobre
// el secreto para los vendedores (cambiar nombre, desactivar, regenerar el código)
// y nunca puede pisar a la facturadora ni al administrador. Funciones puras.

const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

// Sin tildes, en minúsculas y con espacios simples: para comparar nombres.
export const nameKey = (name) => String(name || "").normalize("NFD").replace(DIACRITICS, "").toLowerCase().replace(/\s+/g, " ").trim();

// Id a partir del nombre ("José Luis" → "jose-luis").
export const slugId = (name) => nameKey(name).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "vendedor";

// Todas las personas: { id, name, role, token, active, source }.
export function mergeUsers(secretUsers, dbVendors) {
  const byId = new Map();
  secretUsers.forEach((u) => byId.set(u.id, { id: u.id, name: u.name, role: u.role, token: u.token, active: true, source: "secret" }));
  dbVendors.forEach((v) => {
    const existing = byId.get(v.id);
    if (existing && existing.role !== "vendedor") return;
    byId.set(v.id, {
      id: v.id, name: v.name, role: "vendedor", token: v.token, active: !!v.active, source: "db",
      createdAt: v.createdAt, updatedAt: v.updatedAt,
    });
  });
  return [...byId.values()];
}

const collator = new Intl.Collator("es", { sensitivity: "base" });

// Vendedores para la pantalla de administración, por orden alfabético.
export function vendorsView(roster) {
  return roster
    .filter((u) => u.role === "vendedor")
    .map((u) => ({ id: u.id, name: u.name, token: u.token, active: u.active, source: u.source }))
    .sort((a, b) => collator.compare(a.name, b.name));
}

// Un id libre: el del nombre, y si ya existe (de cualquier persona), con -2, -3…
export function freeId(name, roster) {
  const taken = new Set(roster.map((u) => u.id));
  const base = slugId(name);
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  return id;
}
