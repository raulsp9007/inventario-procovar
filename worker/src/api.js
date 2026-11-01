// Buzón de pedidos entre los vendedores y la facturadora. Lógica pura de la API:
// recibe la petición, el almacén, los usuarios y el reloj; devuelve la respuesta.
// Ver docs/superpowers/specs/2026-10-30-facturacion-nube-design.md.

import { mergeUsers, vendorsView, freeId, nameKey } from "./roster.js";
import {
  ACCOUNT_ROLES, MAX_FAILS, LOCK_MS, SESSION_MS, accountView, hashPassword, hashToken, parseAccountInput, usernameKey, verifyPassword,
} from "./accounts.js";

const ALLOWED_ORIGINS = ["https://raulsp9007.github.io"];
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RETENTION_DAYS = 60;
const DEFAULT_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function corsHeaders(origin) {
  const headers = { Vary: "Origin" };
  if (origin && (ALLOWED_ORIGINS.includes(origin) || LOCAL_ORIGIN.test(origin))) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET,PUT,POST,DELETE,OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return headers;
}

function reply(origin, data, status = 200) {
  return new Response(data === null ? null : JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), ...(data === null ? {} : { "Content-Type": "application/json; charset=utf-8" }) },
  });
}

const fail = (origin, status, message) => reply(origin, { error: message }, status);

// Comparación en tiempo constante (no revela cuántos caracteres acertó).
function sameToken(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authenticate(request, users) {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  let found = null;
  for (const user of users) if (sameToken(user.token, token)) found = user;
  return found;
}

const cleanText = (value, max) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

// Valida y limpia el cuerpo de un pedido. Solo se guarda lo necesario: no entra
// el teléfono del cliente ni notas.
function parseOrder(body) {
  if (!body || typeof body !== "object") return { error: "El pedido no tiene el formato esperado." };
  const customerName = cleanText(body.customerName, 120);
  if (!customerName) return { error: "Falta el nombre del cliente." };
  if (typeof body.date !== "string" || !DATE_PATTERN.test(body.date)) return { error: "La fecha no es válida (AAAA-MM-DD)." };
  if (!Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > 50) return { error: "El pedido no tiene productos." };
  const lines = [];
  for (const line of body.lines) {
    const code = cleanText(line && line.code, 40);
    const name = cleanText(line && line.name, 120) || code;
    if (!code) return { error: "Un producto no tiene código." };
    if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > 100000) return { error: "La cantidad de un producto no es válida." };
    if (typeof line.unitPrice !== "number" || !Number.isFinite(line.unitPrice) || line.unitPrice < 0) return { error: "El precio de un producto no es válido." };
    lines.push({ code, name, qty: line.qty, unitPrice: line.unitPrice });
  }
  if (typeof body.total !== "number" || !Number.isFinite(body.total) || body.total < 0) return { error: "El total no es válido." };
  // Datos para buscar al cliente (código del portal y negocio): opcionales y fuera
  // del "contenido" del pedido, así que cambiarlos no reabre un pedido confirmado.
  const customerCode = cleanText(body.customerCode, 40);
  const businessName = cleanText(body.businessName, 120);
  return {
    value: { customerName, date: body.date, total: body.total, lines },
    extra: { ...(customerCode ? { customerCode } : {}), ...(businessName ? { businessName } : {}) },
  };
}

const sameContent = (order, content) =>
  JSON.stringify({ customerName: order.customerName, date: order.date, total: order.total, lines: order.lines })
  === JSON.stringify(content);

// El pedido con exactamente el código y negocio que llegaron (quita los que ya no vienen).
function withExtra(order, extra) {
  const { customerCode, businessName, ...rest } = order;
  return { ...rest, ...extra };
}

const sameExtra =(order, extra) => (order.customerCode || "") === (extra.customerCode || "") && (order.businessName || "") === (extra.businessName || "");

function statusRow(o) {
  return { id: o.id, status: o.status, rev: o.rev, modified: o.modified, confirmedAt: o.confirmedAt, confirmedBy: o.confirmedBy, updatedAt: o.updatedAt };
}

const byRecent = (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);

async function readJson(request) {
  try {
    return { body: await request.json() };
  } catch {
    return { error: true };
  }
}

// Código nuevo para un vendedor: 24 bytes al azar en base64url (32 caracteres).
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const NAME_MAX = 40;

// Nombre de vendedor: texto con espacios simples, de 1 a 40 caracteres.
function parseVendorName(value) {
  const name = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!name) return { error: "Falta el nombre del vendedor." };
  if (name.length > NAME_MAX) return { error: `El nombre es demasiado largo (máximo ${NAME_MAX} caracteres).` };
  return { name };
}

// `makeToken` se puede cambiar en las pruebas.
export async function handleRequest(request, { store, users, now, makeToken = randomToken }) {
  const origin = request.headers.get("Origin");
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method;

  if (method === "OPTIONS") return reply(origin, null, 204);

  const stamp = now();
  const accounts = await store.listAccounts();

  // Entrar con usuario y contraseña (facturación o supervisión): da una sesión.
  if (method === "POST" && path === "/login") {
    const read = await readJson(request);
    const body = (!read.error && read.body && typeof read.body === "object") ? read.body : {};
    const wrong = () => fail(origin, 401, "Usuario o contraseña incorrectos.");
    const key = typeof body.usuario === "string" ? usernameKey(body.usuario) : "";
    const clave = typeof body.clave === "string" ? body.clave : "";
    const account = key ? accounts.find((a) => a.usernameKey === key) : null;
    if (!account || !account.active || !clave) return wrong();
    if (account.lockedUntil && account.lockedUntil > stamp) return fail(origin, 429, "Demasiados intentos. Espera unos minutos.");
    if (!(await verifyPassword(clave, account))) {
      const failCount = (account.failCount || 0) + 1;
      const locked = failCount >= MAX_FAILS;
      await store.putAccount({ ...account, failCount: locked ? 0 : failCount, lockedUntil: locked ? new Date(new Date(stamp).getTime() + LOCK_MS).toISOString() : null });
      return wrong();
    }
    if (account.failCount || account.lockedUntil) await store.putAccount({ ...account, failCount: 0, lockedUntil: null });
    let token = makeToken();
    while (await store.getSession(await hashToken(token))) token = makeToken();
    const expiresAt = new Date(new Date(stamp).getTime() + SESSION_MS).toISOString();
    await store.purgeSessions(stamp);
    await store.putSession({ tokenHash: await hashToken(token), role: account.role, createdAt: stamp, expiresAt });
    return reply(origin, { token, role: account.role, name: account.username, expiresAt });
  }

  // Quién tiene acceso: los del secreto + los vendedores que maneja el administrador.
  // Una cuenta de facturación o supervisión con usuario y contraseña reemplaza al
  // usuario de ese rol que venga del secreto.
  const accountRoles = new Set(accounts.map((a) => a.role));
  const roster = mergeUsers(users.filter((u) => !accountRoles.has(u.role)), await store.listVendors());
  let user = authenticate(request, roster.filter((u) => u.active));
  if (!user) {
    const header = request.headers.get("Authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const session = token ? await store.getSession(await hashToken(token)) : null;
    const account = session && session.expiresAt > stamp ? accounts.find((a) => a.role === session.role) : null;
    if (account && account.active) user = { id: `cuenta-${account.role}`, name: account.username, role: account.role, token: "" };
  }
  if (!user) return fail(origin, 401, "Código no válido.");
  const only = (role) => (user.role === role ? null : fail(origin, 403, "Esto no es para tu usuario."));

  if (method === "GET" && path === "/me") return reply(origin, { id: user.id, name: user.name, role: user.role });

  // ----- vendedor -----
  if (method === "GET" && path === "/orders/status") {
    const denied = only("vendedor");
    if (denied) return denied;
    const orders = await store.listBySeller(user.id, url.searchParams.get("since") || "");
    return reply(origin, { now: stamp, orders: orders.map(statusRow) });
  }

  const one = path.match(/^\/orders\/([^/]+)$/);
  const confirmOne = path.match(/^\/orders\/([^/]+)\/confirm$/);

  if (method === "PUT" && one && one[1] !== "confirm" && one[1] !== "unconfirm") {
    const denied = only("vendedor");
    if (denied) return denied;
    const id = decodeURIComponent(one[1]);
    if (!ID_PATTERN.test(id)) return fail(origin, 400, "El id del pedido no es válido.");
    const read = await readJson(request);
    if (read.error) return fail(origin, 400, "El cuerpo no es JSON.");
    const parsed = parseOrder(read.body);
    if (parsed.error) return fail(origin, 400, parsed.error);

    const existing = await store.get(id);
    if (existing && existing.sellerId !== user.id) return fail(origin, 403, "Ese pedido es de otro vendedor.");

    let order;
    if (!existing) {
      order = {
        id, sellerId: user.id, sellerName: user.name, ...parsed.value, ...parsed.extra, status: "pendiente", rev: 1, modified: false,
        confirmedAt: null, confirmedBy: null, createdAt: stamp, updatedAt: stamp,
      };
    } else if (existing.status === "cancelado") {
      order = withExtra({ ...existing, ...parsed.value, status: "pendiente", rev: existing.rev + 1, modified: false, confirmedAt: null, confirmedBy: null, updatedAt: stamp }, parsed.extra);
    } else if (sameContent(existing, parsed.value)) {
      // Mismo pedido: solo se ponen al día el código y el negocio, sin tocar su estado.
      if (sameExtra(existing, parsed.extra)) return reply(origin, existing);
      order = withExtra({ ...existing }, parsed.extra);
    } else {
      order = withExtra({ ...existing, ...parsed.value, status: "pendiente", rev: existing.rev + 1, modified: true, confirmedAt: null, confirmedBy: null, updatedAt: stamp }, parsed.extra);
    }
    await store.put(order);
    await store.purge(new Date(new Date(stamp).getTime() - RETENTION_DAYS * DAY_MS).toISOString());
    return reply(origin, order);
  }

  if (method === "DELETE" && one) {
    const denied = only("vendedor");
    if (denied) return denied;
    const existing = await store.get(decodeURIComponent(one[1]));
    if (!existing) return fail(origin, 404, "No existe ese pedido.");
    if (existing.sellerId !== user.id) return fail(origin, 403, "Ese pedido es de otro vendedor.");
    if (existing.status === "cancelado") return reply(origin, existing);
    const order = { ...existing, status: "cancelado", rev: existing.rev + 1, modified: false, confirmedAt: null, confirmedBy: null, updatedAt: stamp };
    await store.put(order);
    return reply(origin, order);
  }

  if (method === "POST" && confirmOne) {
    const denied = only("vendedor");
    if (denied) return denied;
    const existing = await store.get(decodeURIComponent(confirmOne[1]));
    if (!existing) return fail(origin, 404, "No existe ese pedido.");
    if (existing.sellerId !== user.id) return fail(origin, 403, "Ese pedido es de otro vendedor.");
    if (existing.status === "cancelado") return fail(origin, 409, "El pedido está cancelado.");
    if (existing.status === "confirmado") return reply(origin, existing);
    const order = { ...existing, status: "confirmado", modified: false, confirmedAt: stamp, confirmedBy: "vendedor", updatedAt: stamp };
    await store.put(order);
    return reply(origin, order);
  }

  // ----- facturadora -----
  if (method === "GET" && path === "/orders") {
    // La supervisión solo mira: ve la lista pero no puede confirmar nada.
    const denied = user.role === "facturadora" || user.role === "supervisor" ? null : fail(origin, 403, "Esto no es para tu usuario.");
    if (denied) return denied;
    const requested = url.searchParams.get("desde");
    const desde = requested && DATE_PATTERN.test(requested)
      ? requested
      : new Date(new Date(stamp).getTime() - DEFAULT_WINDOW_DAYS * DAY_MS).toISOString().slice(0, 10);
    const orders = await store.listFrom(desde);
    const sellers = roster.filter((u) => u.role === "vendedor" && u.active).map((seller) => {
      const mine = orders.filter((o) => o.sellerId === seller.id).sort(byRecent);
      return {
        id: seller.id, name: seller.name,
        pending: mine.filter((o) => o.status === "pendiente").length,
        confirmed: mine.filter((o) => o.status === "confirmado").length,
        orders: mine,
      };
    });
    return reply(origin, { now: stamp, sellers });
  }

  if (method === "POST" && (path === "/orders/confirm" || path === "/orders/unconfirm")) {
    const denied = only("facturadora");
    if (denied) return denied;
    const read = await readJson(request);
    const ids = read.body && read.body.ids;
    if (read.error || !Array.isArray(ids) || ids.some((id) => typeof id !== "string")) return fail(origin, 400, "Falta la lista de pedidos (ids).");
    const done = [];
    const missing = [];
    for (const id of ids) {
      const existing = await store.get(id);
      if (path === "/orders/confirm") {
        if (!existing || existing.status === "cancelado") { missing.push(id); continue; }
        if (existing.status !== "confirmado") {
          await store.put({ ...existing, status: "confirmado", modified: false, confirmedAt: stamp, confirmedBy: "facturadora", updatedAt: stamp });
        }
        done.push(id);
      } else {
        if (!existing || existing.status !== "confirmado" || existing.confirmedBy !== "facturadora") { missing.push(id); continue; }
        await store.put({ ...existing, status: "pendiente", confirmedAt: null, confirmedBy: null, updatedAt: stamp });
        done.push(id);
      }
    }
    return reply(origin, path === "/orders/confirm" ? { confirmed: done, missing } : { unconfirmed: done, missing });
  }

  // ----- administrador: la lista de vendedores -----
  if (path.startsWith("/admin/")) {
    const denied = only("admin");
    if (denied) return denied;

    if (path === "/admin/accounts" || path.startsWith("/admin/accounts/")) {
      if (method === "GET" && path === "/admin/accounts") {
        const byRole = (role) => accountView(accounts.find((a) => a.role === role));
        return reply(origin, { facturacion: byRole(ACCOUNT_ROLES.facturacion), supervision: byRole(ACCOUNT_ROLES.supervision) });
      }
      const target = path.match(/^\/admin\/accounts\/([^/]+)$/);
      const role = target ? ACCOUNT_ROLES[decodeURIComponent(target[1])] : null;
      if (method === "PUT" && role) {
        const read = await readJson(request);
        if (read.error) return fail(origin, 400, "El cuerpo no es JSON.");
        const current = accounts.find((a) => a.role === role) || null;
        const parsed = parseAccountInput(read.body, current);
        if (parsed.error) return fail(origin, 400, parsed.error);
        if (parsed.usuario && accounts.some((a) => a.role !== role && a.usernameKey === usernameKey(parsed.usuario))) {
          return fail(origin, 409, "Ya hay una cuenta con ese usuario.");
        }
        const next = current
          ? { ...current, updatedAt: stamp }
          : { role, createdAt: stamp, updatedAt: stamp, active: true, failCount: 0, lockedUntil: null };
        if (parsed.usuario) { next.username = parsed.usuario; next.usernameKey = usernameKey(parsed.usuario); }
        if (parsed.clave) { Object.assign(next, await hashPassword(parsed.clave), { failCount: 0, lockedUntil: null }); }
        if (parsed.activo !== undefined) next.active = parsed.activo;
        await store.putAccount(next);
        // Nueva contraseña o cuenta desactivada: las sesiones abiertas dejan de servir.
        if (parsed.clave || parsed.activo === false) await store.deleteSessionsByRole(role);
        return reply(origin, accountView(next));
      }
      return fail(origin, 404, "No existe esa ruta.");
    }

    const view = (id) => vendorsView(mergeUsers(users, vendorsSnapshot)).find((v) => v.id === id);
    // La lista tal como estaba al empezar, más lo que se guarde en esta petición.
    let vendorsSnapshot = roster.filter((u) => u.source === "db").map((u) => ({ id: u.id, name: u.name, token: u.token, active: u.active, createdAt: u.createdAt, updatedAt: u.updatedAt }));
    const save = async (vendor) => {
      await store.putVendor(vendor);
      vendorsSnapshot = [...vendorsSnapshot.filter((v) => v.id !== vendor.id), vendor];
    };
    const found = (id) => roster.find((u) => u.id === id && u.role === "vendedor");
    // Lo que se guarda en la base de un vendedor (también de uno que venía solo del secreto).
    const asRecord = (u, patch) => ({
      id: u.id, name: u.name, token: u.token, active: u.active, createdAt: u.createdAt || stamp, updatedAt: stamp, ...patch,
    });
    const nameTaken = (name, exceptId) => roster.some((u) => u.role === "vendedor" && u.id !== exceptId && nameKey(u.name) === nameKey(name));

    if (method === "GET" && path === "/admin/vendors") {
      const fact = roster.find((u) => u.role === "facturadora");
      return reply(origin, {
        vendors: vendorsView(roster),
        facturadora: fact ? { id: fact.id, name: fact.name, token: fact.token } : null,
      });
    }

    if (method === "POST" && path === "/admin/vendors") {
      const read = await readJson(request);
      if (read.error) return fail(origin, 400, "El cuerpo no es JSON.");
      const parsed = parseVendorName(read.body && read.body.name);
      if (parsed.error) return fail(origin, 400, parsed.error);
      if (nameTaken(parsed.name, null)) return fail(origin, 409, "Ya hay un vendedor con ese nombre.");
      let token = makeToken();
      while (roster.some((u) => u.token === token)) token = makeToken();
      const id = freeId(parsed.name, roster);
      await save({ id, name: parsed.name, token, active: true, createdAt: stamp, updatedAt: stamp });
      return reply(origin, view(id));
    }

    const one = path.match(/^\/admin\/vendors\/([^/]+)$/);
    const regenerate = path.match(/^\/admin\/vendors\/([^/]+)\/regenerate$/);

    if (method === "PUT" && one) {
      const current = found(decodeURIComponent(one[1]));
      if (!current) return fail(origin, 404, "No existe ese vendedor.");
      const read = await readJson(request);
      if (read.error) return fail(origin, 400, "El cuerpo no es JSON.");
      const body = read.body || {};
      const patch = {};
      if (body.name !== undefined) {
        const parsed = parseVendorName(body.name);
        if (parsed.error) return fail(origin, 400, parsed.error);
        if (nameTaken(parsed.name, current.id)) return fail(origin, 409, "Ya hay un vendedor con ese nombre.");
        patch.name = parsed.name;
      }
      if (body.active !== undefined) {
        if (typeof body.active !== "boolean") return fail(origin, 400, "Activo debe ser verdadero o falso.");
        patch.active = body.active;
      }
      if (Object.keys(patch).length === 0) return fail(origin, 400, "No hay nada que cambiar.");
      await save(asRecord(current, patch));
      return reply(origin, view(current.id));
    }

    if (method === "POST" && regenerate) {
      const current = found(decodeURIComponent(regenerate[1]));
      if (!current) return fail(origin, 404, "No existe ese vendedor.");
      let token = makeToken();
      while (roster.some((u) => u.token === token)) token = makeToken();
      await save(asRecord(current, { token }));
      return reply(origin, view(current.id));
    }
  }

  return fail(origin, 404, "No existe esa ruta.");
}
