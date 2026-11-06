// Buzón de pedidos entre los vendedores y la facturadora. Lógica pura de la API:
// recibe la petición, el almacén, los usuarios y el reloj; devuelve la respuesta.
// Ver docs/superpowers/specs/2026-10-30-facturacion-nube-design.md.

import { mergeUsers, vendorsView, freeId, nameKey } from "./roster.js";
import {
  cubaDate, parseSchedule, scheduleStatus, validateSchedule, parseCierre, cierreStatus, validateCierre, parseZone, zoneLabel, siteNow, ZONES,
  adjustFromManual, parseAdjust, shiftIso, isTimeOfDay, nextWorkingDay,
} from "./schedule.js";
import {
  ACCOUNT_ROLES, MAX_FAILS, LOCK_MS, SESSION_MS, accountView, hashPassword, hashToken, parseAccountInput, usernameKey, verifyPassword,
} from "./accounts.js";

const ALLOWED_ORIGINS = ["https://raulsp9007.github.io"];
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
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

// Huella corta de un texto (para saber si cambió algo, no para seguridad).
function shortHash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const MAX_REJECTIONS = 100;
const MAX_BATCH = 50;
const LATE_MINUTES = 2;

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

  // Todos los ajustes del buzón (cuentas, horario, cierre, zona y hora a mano) se leen de una sola vez al
  // empezar la petición: cada consulta a la base cuenta, y antes eran hasta cinco por petición. Lo que se
  // guarda en esta petición se refleja aquí al momento.
  const SETTING_KEYS = ["cuentas", "horario", "cierre", "zona", "zona_ajuste", "limpieza", "rechazos"];
  const settings = await store.getSettings(SETTING_KEYS);
  const setting = (key) => (Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : null);
  const saveSetting = async (key, value) => {
    await store.putSetting(key, value);
    settings[key] = String(value);
  };

  // Las cuentas con usuario y contraseña (varias por rol) viven en los ajustes. La primera vez se pasan
  // las de antes (una por rol; su id es el rol, así siguen valiendo las sesiones abiertas).
  const saveAccounts = (list) => saveSetting("cuentas", JSON.stringify(list));
  const loadAccounts = async () => {
    const raw = setting("cuentas");
    if (raw !== null) {
      try {
        const list = JSON.parse(raw);
        return Array.isArray(list) ? list : [];
      } catch {
        return [];
      }
    }
    const migrated = (await store.listAccounts()).map((a) => ({ ...a, id: a.role }));
    if (migrated.length > 0) await saveAccounts(migrated);
    return migrated;
  };
  let accounts = await loadAccounts();

  // Entrar con usuario y contraseña (facturación, supervisión o administración): da una sesión.
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
      const failed = { ...account, failCount: locked ? 0 : failCount, lockedUntil: locked ? new Date(new Date(stamp).getTime() + LOCK_MS).toISOString() : null };
      await saveAccounts(accounts.map((a) => (a.id === account.id ? failed : a)));
      return wrong();
    }
    if (account.failCount || account.lockedUntil) await saveAccounts(accounts.map((a) => (a.id === account.id ? { ...account, failCount: 0, lockedUntil: null } : a)));
    let token = makeToken();
    while (await store.getSession(await hashToken(token))) token = makeToken();
    const expiresAt = new Date(new Date(stamp).getTime() + SESSION_MS).toISOString();
    await store.purgeSessions(stamp);
    await store.putSession({ tokenHash: await hashToken(token), accountId: account.id, createdAt: stamp, expiresAt });
    return reply(origin, { token, role: account.role, name: account.username, expiresAt });
  }

  // Quién tiene acceso: los del secreto + los vendedores que maneja el administrador.
  // Una cuenta de facturación o supervisión con usuario y contraseña reemplaza al
  // usuario de ese rol que venga del secreto. La del administrador no: su enlace sigue sirviendo.
  const accountRoles = new Set(accounts.filter((a) => a.role !== "admin").map((a) => a.role));
  const roster = mergeUsers(users.filter((u) => !accountRoles.has(u.role)), await store.listVendors());
  let user = authenticate(request, roster.filter((u) => u.active));
  if (!user) {
    const header = request.headers.get("Authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const session = token ? await store.getSession(await hashToken(token)) : null;
    const account = session && session.expiresAt > stamp ? accounts.find((a) => a.id === session.accountId) : null;
    if (account && account.active) {
      user = { id: `cuenta-${account.id}`, name: account.username, role: account.role, token: "" };
      // Mientras se usa, la sesión se renueva sola: pasada la mitad de su vida se alarga otras 24 horas (así no
      // vence en plena jornada). Una escritura como mucho cada 12 horas por sesión.
      if (new Date(session.expiresAt).getTime() - new Date(stamp).getTime() < SESSION_MS / 2) {
        await store.putSession({ ...session, expiresAt: new Date(new Date(stamp).getTime() + SESSION_MS).toISOString() });
      }
    }
  }
  if (!user) return fail(origin, 401, "Código no válido.");
  const only = (role) => (user.role === role ? null : fail(origin, 403, "Esto no es para tu usuario."));

  if (method === "GET" && path === "/me") return reply(origin, { id: user.id, name: user.name, role: user.role });

  // La hora de las apps, en la hora del sitio: la zona y, si el administrador la puso a mano, el ajuste. Las apps la
  // usan para contar el día y la hora de cierre igual que el buzón (ver loadSiteClock).

  // Horario de facturación: fuera de horario se pausa lo que el vendedor envía, borra o confirma a
  // mano, y lo que la facturadora confirma o deshace. Ver pedidos y todo lo del administrador sigue.
  const loadSchedule = async () => parseSchedule(setting("horario"));
  const loadCierre = async () => parseCierre(setting("cierre"));
  // La hora a la que trabaja el sitio: la zona horaria que eligió el administrador y, si la puso a mano,
  // el ajuste en minutos. `at` es el instante ya corrido, para contar horario, cierre y día de hoy.
  const loadSiteClock = async () => {
    const zone = parseZone(setting("zona"));
    const adjust = parseAdjust(setting("zona_ajuste"));
    return { zone, adjust, at: shiftIso(stamp, adjust) };
  };
  if (method === "GET" && path === "/time") {
    const site = await loadSiteClock();
    return reply(origin, { now: stamp, zona: site.zone, ajuste: site.adjust, hoy: cubaDate(site.at, site.zone), hora: siteNow(site.at, site.zone).hora });
  }

  // Los envíos rechazados (por el cierre, por el horario o por datos mal hechos) se anotan, los últimos 100, para
  // que el administrador vea qué pasó (resumen de envíos del día).
  const readRejections = () => {
    try {
      const list = JSON.parse(setting("rechazos") || "[]");
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  };
  const recordRejection = async (motivo, detalle, cliente) => {
    const entry = { at: stamp, vendedorId: user.id, vendedor: user.name, motivo, detalle, ...(cliente ? { cliente } : {}) };
    await saveSetting("rechazos", JSON.stringify([...readRejections(), entry].slice(-MAX_REJECTIONS)));
  };

  // Limpieza: no se guarda historia, solo lo del día (lo que se vende hoy) y lo montado para los días que vienen; los pedidos de
  // días anteriores se borran del todo. Una sola vez al día, pasada la hora de cierre del día (o a la
  // primera petición del día si no hay cierre), en vez de cada vez que se sube un pedido.
  const maybeCleanup = async () => {
    const site = await loadSiteClock();
    const hoy = cubaDate(site.at, site.zone);
    if (setting("limpieza") === hoy) return;
    const cierre = cierreStatus(await loadCierre(), site.at, site.zone);
    if (cierre.activo && !cierre.cerrado) return;
    await store.purgeBefore(hoy);
    await saveSetting("limpieza", hoy);
  };

  const isUpload = user.role === "vendedor" && ((method === "PUT" && /^\/orders\/[^/]+$/.test(path)) || (method === "POST" && path === "/orders/batch"));
  const vendorWrite = user.role === "vendedor" && method !== "GET" && (path === "/orders" || path.startsWith("/orders/"));
  const factWrite = user.role === "facturadora" && method === "POST" && (path === "/orders/confirm" || path === "/orders/unconfirm");
  if (vendorWrite || factWrite) {
    const site = await loadSiteClock();
    const status = scheduleStatus(await loadSchedule(), site.at, site.zone);
    if (!status.abierto) {
      if (isUpload) await recordRejection("horario", status.mensaje);
      return fail(origin, 423, status.mensaje);
    }
  }

  // Resumen de ventas de un día: lo enviado a facturación por cada vendedor, producto por producto
  // (confirmado o no; sin cancelados). Lo ven el administrador y la supervisión.
  if (method === "GET" && path === "/summary") {
    if (user.role !== "admin" && user.role !== "supervisor") return fail(origin, 403, "Esto no es para tu usuario.");
    const requested = url.searchParams.get("fecha");
    const site = await loadSiteClock();
    const fecha = requested || cubaDate(site.at, site.zone);
    const parsed = new Date(`${fecha}T00:00:00Z`);
    if (!DATE_PATTERN.test(fecha) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== fecha) return fail(origin, 400, "La fecha no es válida (AAAA-MM-DD).");
    const orders = (await store.listFrom(fecha)).filter((o) => o.date === fecha);
    const byQty = (a, b) => b.qty - a.qty || a.name.localeCompare(b.name, "es");
    const all = new Map();
    const vendedores = roster.filter((u) => u.role === "vendedor" && u.active).map((seller) => {
      const mine = orders.filter((o) => o.sellerId === seller.id);
      const items = new Map();
      mine.forEach((o) => o.lines.forEach((l) => {
        const item = items.get(l.code) || { code: l.code, name: l.name, qty: 0 };
        item.qty += l.qty;
        items.set(l.code, item);
        const total = all.get(l.code) || { code: l.code, name: l.name, qty: 0 };
        total.qty += l.qty;
        all.set(l.code, total);
      }));
      const productos = [...items.values()].sort(byQty);
      return { id: seller.id, name: seller.name, pedidos: mine.length, unidades: productos.reduce((s, p) => s + p.qty, 0), productos };
    }).sort((a, b) => a.name.localeCompare(b.name, "es"));
    const productos = [...all.values()].sort(byQty);
    return reply(origin, {
      fecha, vendedores, productos,
      totales: { pedidos: vendedores.reduce((s, v) => s + v.pedidos, 0), unidades: productos.reduce((s, p) => s + p.qty, 0) },
    });
  }

  // ----- vendedor -----
  if (method === "GET" && path === "/orders/status") {
    const denied = only("vendedor");
    if (denied) return denied;
    const orders = await store.listBySeller(user.id, url.searchParams.get("since") || "");
    const site = await loadSiteClock();
    return reply(origin, {
      now: stamp, orders: orders.map(statusRow), horario: scheduleStatus(await loadSchedule(), site.at, site.zone),
      cierre: cierreStatus(await loadCierre(), site.at, site.zone), zona: site.zone, ajuste: site.adjust,
    });
  }

  const one = path.match(/^\/orders\/([^/]+)$/);
  const confirmOne = path.match(/^\/orders\/([^/]+)\/confirm$/);

  // Guarda un pedido (uno solo o de un lote). Devuelve { status, json }: el pedido, o { error } con su estado.
  // El cierre de facturación del día: pasada la hora no se envía ni se cambia un pedido de hoy (los de otro día
  // sí). Si la subida se demoró (mala señal, cola), la app dice cuándo se hizo el cambio (enviadoEn) y su hora al
  // subirlo (ahora): el cierre se cuenta en el momento del envío y no cuando por fin llega. La espera es la
  // diferencia entre esas dos horas de la app (el reloj del teléfono no importa); si no tiene sentido (falta,
  // negativa o de más de 12 horas), no se tiene en cuenta. Esa espera también da la hora real de envío (sentAt).
  const saveOrder = async (id, body, ahora) => {
    const customer = body && typeof body.customerName === "string" ? cleanText(body.customerName, 120) : "";
    const rejected = async (status, message, motivo) => {
      await recordRejection(motivo, message, customer);
      return { status, json: { error: message } };
    };
    if (typeof id !== "string" || !ID_PATTERN.test(id)) return rejected(400, "El id del pedido no es válido.", "datos");
    const parsed = parseOrder(body);
    if (parsed.error) return rejected(400, parsed.error, "datos");
    const site = await loadSiteClock();
    const isoText = (value) => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) ? Date.parse(value) : NaN);
    const waited = isoText(ahora) - isoText(body.enviadoEn);
    const waitedMs = Number.isFinite(waited) && waited > 0 && waited <= 12 * 3600000 ? waited : 0;
    const sentAt = shiftIso(stamp, -waitedMs / 60000);
    const cierre = cierreStatus(await loadCierre(), shiftIso(site.at, -waitedMs / 60000), site.zone);
    if (cierre.cerrado && parsed.value.date === cubaDate(shiftIso(site.at, -waitedMs / 60000), site.zone)) return rejected(409, cierre.mensaje, "cierre");

    const existing = await store.get(id);
    if (existing && existing.sellerId !== user.id) return { status: 403, json: { error: "Ese pedido es de otro vendedor." } };

    let order;
    if (!existing) {
      order = {
        id, sellerId: user.id, sellerName: user.name, ...parsed.value, ...parsed.extra, status: "pendiente", rev: 1, modified: false,
        confirmedAt: null, confirmedBy: null, createdAt: stamp, updatedAt: stamp, sentAt,
      };
    } else if (existing.status === "cancelado") {
      order = withExtra({ ...existing, ...parsed.value, status: "pendiente", rev: existing.rev + 1, modified: false, confirmedAt: null, confirmedBy: null, updatedAt: stamp, sentAt }, parsed.extra);
    } else if (sameContent(existing, parsed.value)) {
      // Mismo pedido: solo se ponen al día el código y el negocio, sin tocar su estado.
      if (sameExtra(existing, parsed.extra)) return { status: 200, json: existing };
      order = withExtra({ ...existing }, parsed.extra);
    } else {
      order = withExtra({ ...existing, ...parsed.value, status: "pendiente", rev: existing.rev + 1, modified: true, confirmedAt: null, confirmedBy: null, updatedAt: stamp, sentAt }, parsed.extra);
    }
    await store.put(order);
    return { status: 200, json: order };
  };

  if (method === "PUT" && one && one[1] !== "confirm" && one[1] !== "unconfirm" && one[1] !== "batch") {
    const denied = only("vendedor");
    if (denied) return denied;
    const id = decodeURIComponent(one[1]);
    const read = await readJson(request);
    if (read.error) return fail(origin, 400, "El cuerpo no es JSON.");
    const body = read.body && typeof read.body === "object" ? read.body : null;
    await maybeCleanup();
    const saved = await saveOrder(id, body, body && body.ahora);
    return reply(origin, saved.json, saved.status);
  }

  // Varios pedidos de una vez (la cola de la app, cuando hay muchos): { pedidos: [{ id, ...pedido, enviadoEn }], ahora }.
  // Cada pedido sale con su resultado: uno rechazado (cierre, datos, de otro vendedor) no tumba a los demás.
  if (method === "POST" && path === "/orders/batch") {
    const denied = only("vendedor");
    if (denied) return denied;
    const read = await readJson(request);
    const body = !read.error && read.body && typeof read.body === "object" ? read.body : null;
    if (!body || !Array.isArray(body.pedidos) || body.pedidos.length < 1 || body.pedidos.length > MAX_BATCH) {
      return fail(origin, 400, `Manda de 1 a ${MAX_BATCH} pedidos en "pedidos".`);
    }
    await maybeCleanup();
    const resultados = [];
    for (const item of body.pedidos) {
      const entry = item && typeof item === "object" ? item : {};
      const saved = await saveOrder(entry.id, entry, entry.ahora !== undefined ? entry.ahora : body.ahora);
      resultados.push(saved.status === 200 ? { id: entry.id, ok: true } : { id: entry.id, ok: false, status: saved.status, error: saved.json.error });
    }
    return reply(origin, { resultados });
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
    const activeSellers = roster.filter((u) => u.role === "vendedor" && u.active);
    // La versión: cambia con cualquier pedido nuevo, cambiado, confirmado o cancelado, o si cambian los vendedores. Si
    // la página ya tiene esa versión, no hace falta mandarle toda la lista (solo el día de trabajo y el horario).
    const version = `${await store.versionFrom(desde)}|${shortHash(activeSellers.map((s) => `${s.id}:${s.name}`).sort().join(","))}`;
    await maybeCleanup();
    const site = await loadSiteClock();
    // El día de trabajo: hoy, y pasada la hora de cierre del día (la que pone el administrador) el siguiente día
    // de trabajo. La página muestra solo los pedidos de ese día: a la hora del cierre se limpia lo de hoy y
    // van apareciendo los de mañana. `hoy` es la fecha de hoy en la hora del sitio.
    const hoy = cubaDate(site.at, site.zone);
    const cierre = cierreStatus(await loadCierre(), site.at, site.zone);
    const common = { now: stamp, horario: scheduleStatus(await loadSchedule(), site.at, site.zone), hoy, dia: cierre.cerrado ? nextWorkingDay(hoy) : hoy, version };
    if (url.searchParams.get("v") === version) return reply(origin, { ...common, sinCambios: true });
    const orders = await store.listFrom(desde);
    const sellers = activeSellers.map((seller) => {
      const mine = orders.filter((o) => o.sellerId === seller.id).sort(byRecent);
      return {
        id: seller.id, name: seller.name,
        pending: mine.filter((o) => o.status === "pendiente").length,
        confirmed: mine.filter((o) => o.status === "confirmado").length,
        orders: mine,
      };
    });
    return reply(origin, { ...common, sellers });
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

    // Envíos del día: cuántos pedidos llegaron, cuáles tardaron en llegar y qué envíos se rechazaron (y por qué).
    if (method === "GET" && path === "/admin/envios") {
      const site = await loadSiteClock();
      const hoy = cubaDate(site.at, site.zone);
      const fecha = url.searchParams.get("fecha") || hoy;
      const parsedDate = new Date(`${fecha}T00:00:00Z`);
      if (!DATE_PATTERN.test(fecha) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== fecha) return fail(origin, 400, "La fecha no es válida (AAAA-MM-DD).");
      const dayOf = (iso) => cubaDate(shiftIso(iso, site.adjust), site.zone);
      const from = new Date(parsedDate.getTime() - DAY_MS).toISOString().slice(0, 10);
      const received = (await store.listFrom(from)).filter((o) => dayOf(o.createdAt) === fecha);
      const delayOf = (o) => new Date(o.createdAt).getTime() - new Date(o.sentAt || o.createdAt).getTime();
      const late = received.filter((o) => delayOf(o) >= LATE_MINUTES * 60000);
      const bySeller = new Map();
      received.forEach((o) => {
        const row = bySeller.get(o.sellerId) || { id: o.sellerId, name: o.sellerName, recibidos: 0, tardios: 0 };
        row.recibidos += 1;
        if (delayOf(o) >= LATE_MINUTES * 60000) row.tardios += 1;
        bySeller.set(o.sellerId, row);
      });
      return reply(origin, {
        fecha,
        recibidos: received.length,
        porVendedor: [...bySeller.values()].sort((a, b) => a.name.localeCompare(b.name, "es")),
        tardios: late
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .map((o) => ({ id: o.id, vendedor: o.sellerName, cliente: o.customerName, enviado: o.sentAt || o.createdAt, llego: o.createdAt, demoraMin: Math.round(delayOf(o) / 60000) })),
        rechazos: readRejections()
          .filter((r) => dayOf(r.at) === fecha)
          .map(({ at, vendedor, motivo, detalle, cliente }) => ({ at, vendedor, motivo, detalle, ...(cliente ? { cliente } : {}) })),
        umbralMin: LATE_MINUTES,
      });
    }

    // La hora del sitio: la zona horaria en la que trabajan el horario, el cierre del día y el resumen.
    if (path === "/admin/zona") {
      const zonaView = (zone, adjust) => ({
        zona: zone, etiqueta: zoneLabel(zone), ahora: siteNow(shiftIso(stamp, adjust), zone).hora, manual: adjust !== 0, ajuste: adjust, zonas: ZONES,
      });
      if (method === "GET") {
        const site = await loadSiteClock();
        return reply(origin, zonaView(site.zone, site.adjust));
      }
      if (method === "PUT") {
        // { zona } elige la zona (y quita la hora a mano); { manual: "HH:MM" } pone la hora que es ahora
        // en el sitio; { manual: null } vuelve a la hora automática.
        const read = await readJson(request);
        const body = !read.error && read.body && typeof read.body === "object" ? read.body : {};
        const hasZone = body.zona !== undefined;
        const hasManual = body.manual !== undefined;
        if (!hasZone && !hasManual) return fail(origin, 400, "Falta la zona o la hora.");
        if (hasZone && (typeof body.zona !== "string" || !ZONES.some((z) => z.id === body.zona))) return fail(origin, 400, "Esa zona horaria no está en la lista.");
        if (hasManual && body.manual !== null && !isTimeOfDay(body.manual)) return fail(origin, 400, "La hora no es válida (formato HH:MM).");
        const zone = hasZone ? body.zona : (await loadSiteClock()).zone;
        const adjust = hasManual && body.manual !== null ? adjustFromManual(body.manual, stamp, zone) : 0;
        await saveSetting("zona", zone);
        await saveSetting("zona_ajuste", String(adjust));
        return reply(origin, zonaView(zone, adjust));
      }
      return fail(origin, 404, "No existe esa ruta.");
    }

    if (path === "/admin/cierre") {
      const current = await loadCierre();
      const site = await loadSiteClock();
      if (method === "GET") return reply(origin, cierreStatus(current, site.at, site.zone));
      if (method === "PUT") {
        const read = await readJson(request);
        if (read.error) return fail(origin, 400, "El cuerpo no es JSON.");
        const body = read.body && typeof read.body === "object" ? read.body : {};
        const checked = validateCierre({
          enabled: body.activo === undefined ? current.enabled : body.activo,
          time: body.hora === undefined ? current.time : body.hora,
        });
        if (checked.error) return fail(origin, 400, checked.error);
        await saveSetting("cierre", JSON.stringify(checked.value));
        return reply(origin, cierreStatus(checked.value, site.at, site.zone));
      }
      return fail(origin, 404, "No existe esa ruta.");
    }

    if (path === "/admin/schedule") {
      const current = await loadSchedule();
      const site = await loadSiteClock();
      if (method === "GET") return reply(origin, scheduleStatus(current, site.at, site.zone));
      if (method === "PUT") {
        const read = await readJson(request);
        if (read.error) return fail(origin, 400, "El cuerpo no es JSON.");
        const body = read.body && typeof read.body === "object" ? read.body : {};
        const checked = validateSchedule({
          enabled: body.activo === undefined ? current.enabled : body.activo,
          open: body.abre === undefined ? current.open : body.abre,
          close: body.cierra === undefined ? current.close : body.cierra,
        });
        if (checked.error) return fail(origin, 400, checked.error);
        await saveSetting("horario", JSON.stringify(checked.value));
        return reply(origin, scheduleStatus(checked.value, site.at, site.zone));
      }
      return fail(origin, 404, "No existe esa ruta.");
    }

    if (path === "/admin/accounts" || path.startsWith("/admin/accounts/")) {
      if (method === "GET" && path === "/admin/accounts") return reply(origin, { cuentas: accounts.map(accountView) });

      // Crear una cuenta: { rol: "facturacion" | "supervision" | "administrador", usuario, clave }.
      if (method === "POST" && path === "/admin/accounts") {
        const read = await readJson(request);
        if (read.error) return fail(origin, 400, "El cuerpo no es JSON.");
        const body = read.body && typeof read.body === "object" ? read.body : {};
        const role = typeof body.rol === "string" && Object.prototype.hasOwnProperty.call(ACCOUNT_ROLES, body.rol) ? ACCOUNT_ROLES[body.rol] : null;
        if (!role) return fail(origin, 400, "Elige si es de facturación, de supervisión o administrador.");
        const parsed = parseAccountInput(body, null);
        if (parsed.error) return fail(origin, 400, parsed.error);
        if (accounts.some((a) => a.usernameKey === usernameKey(parsed.usuario))) return fail(origin, 409, "Ya hay una cuenta con ese usuario.");
        const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(16).padStart(2, "0")).join("");
        let id = newId();
        while (accounts.some((a) => a.id === id)) id = newId();
        const next = {
          id, role, username: parsed.usuario, usernameKey: usernameKey(parsed.usuario), ...(await hashPassword(parsed.clave)),
          active: true, failCount: 0, lockedUntil: null, createdAt: stamp, updatedAt: stamp,
        };
        accounts = [...accounts, next];
        await saveAccounts(accounts);
        return reply(origin, accountView(next));
      }

      const target = path.match(/^\/admin\/accounts\/([^/]+)$/);
      if (method === "PUT" && target) {
        const id = decodeURIComponent(target[1]);
        const current = accounts.find((a) => a.id === id);
        if (!current) return fail(origin, 404, "No existe esa cuenta.");
        const read = await readJson(request);
        if (read.error) return fail(origin, 400, "El cuerpo no es JSON.");
        const parsed = parseAccountInput(read.body, current);
        if (parsed.error) return fail(origin, 400, parsed.error);
        if (parsed.usuario && accounts.some((a) => a.id !== id && a.usernameKey === usernameKey(parsed.usuario))) {
          return fail(origin, 409, "Ya hay una cuenta con ese usuario.");
        }
        const next = { ...current, updatedAt: stamp };
        if (parsed.usuario) { next.username = parsed.usuario; next.usernameKey = usernameKey(parsed.usuario); }
        if (parsed.clave) { Object.assign(next, await hashPassword(parsed.clave), { failCount: 0, lockedUntil: null }); }
        if (parsed.activo !== undefined) next.active = parsed.activo;
        accounts = accounts.map((a) => (a.id === id ? next : a));
        await saveAccounts(accounts);
        // Nueva contraseña o cuenta desactivada: las sesiones abiertas de esa cuenta dejan de servir.
        if (parsed.clave || parsed.activo === false) await store.deleteSessionsByAccount(id);
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
