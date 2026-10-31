// Buzón de pedidos entre los vendedores y la facturadora. Lógica pura de la API:
// recibe la petición, el almacén, los usuarios y el reloj; devuelve la respuesta.
// Ver docs/superpowers/specs/2026-10-30-facturacion-nube-design.md.

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

export async function handleRequest(request, { store, users, now }) {
  const origin = request.headers.get("Origin");
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method;

  if (method === "OPTIONS") return reply(origin, null, 204);

  const user = authenticate(request, users);
  if (!user) return fail(origin, 401, "Código no válido.");
  const only = (role) => (user.role === role ? null : fail(origin, 403, "Esto no es para tu usuario."));
  const stamp = now();

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
    const denied = only("facturadora");
    if (denied) return denied;
    const requested = url.searchParams.get("desde");
    const desde = requested && DATE_PATTERN.test(requested)
      ? requested
      : new Date(new Date(stamp).getTime() - DEFAULT_WINDOW_DAYS * DAY_MS).toISOString().slice(0, 10);
    const orders = await store.listFrom(desde);
    const sellers = users.filter((u) => u.role === "vendedor").map((seller) => {
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

  return fail(origin, 404, "No existe esa ruta.");
}
