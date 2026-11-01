// Genera los usuarios del buzón y los códigos de enlace que se entregan (ver
// worker/README.md). Solo lo usa el script worker/scripts/provision.mjs.
import { randomBytes } from "node:crypto";
import { makeLinkCode } from "../../src/linkCode.js";

const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

export function slugId(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "usuario";
}

// 32 caracteres base64url (≈192 bits).
const randomToken = () => randomBytes(24).toString("base64url");

export function generateUsers({ vendedores, facturadora, administrador }, makeToken = randomToken) {
  const names = (vendedores || []).map((n) => String(n).trim()).filter(Boolean);
  if (names.length === 0) throw new Error("Hace falta al menos un vendedor.");
  if (!String(facturadora || "").trim()) throw new Error("Hace falta el nombre de la facturadora.");

  const used = new Set();
  const uniqueId = (name) => {
    const base = slugId(name);
    let id = base;
    for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`;
    used.add(id);
    return id;
  };

  return [
    ...names.map((name) => ({ id: uniqueId(name), name, role: "vendedor", token: makeToken() })),
    { id: uniqueId(facturadora), name: String(facturadora).trim(), role: "facturadora", token: makeToken() },
    ...(String(administrador || "").trim() ? [{ id: uniqueId(administrador), name: String(administrador).trim(), role: "admin", token: makeToken() }] : []),
  ];
}

// Agrega al administrador a una lista que no lo tenía (sin tocar los códigos que ya
// se entregaron). { users, added }.
export function ensureAdmin(users, name, makeToken = randomToken) {
  if (users.some((u) => u.role === "admin")) return { users, added: false };
  const taken = new Set(users.map((u) => u.id));
  const base = slugId(name);
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  return { users: [...users, { id, name: String(name).trim(), role: "admin", token: makeToken() }], added: true };
}

// `siteUrl` (opcional): dirección del sitio de la facturadora; ella recibe además su
// enlace personal (`siteUrl#código`), que la entra sin pegar nada.
// `adminUrl` (opcional): dirección del sitio de administración; el administrador
// recibe su enlace personal igual que la facturadora.
export function buildLinks(users, url, siteUrl, adminUrl) {
  return users.map((u) => {
    const code = makeLinkCode({ url, token: u.token });
    const site = u.role === "facturadora" ? siteUrl : u.role === "admin" ? adminUrl : undefined;
    return { name: u.name, role: u.role, code, ...(site ? { siteLink: `${site}#${code}` } : {}) };
  });
}
