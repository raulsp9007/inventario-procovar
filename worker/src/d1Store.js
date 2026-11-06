// Almacén de pedidos sobre Cloudflare D1 (SQLite). Misma interfaz que
// memoryStore.js; las pruebas corren la API contra los dos (ver fakeD1.js).

const COLUMNS = [
  "id", "seller_id", "seller_name", "date", "customer_name", "customer_code", "business_name", "lines", "total", "status", "rev", "modified",
  "confirmed_at", "confirmed_by", "created_at", "updated_at",
];

function fromRow(r) {
  if (!r) return null;
  return {
    id: r.id, sellerId: r.seller_id, sellerName: r.seller_name, date: r.date, customerName: r.customer_name,
    ...(r.customer_code ? { customerCode: r.customer_code } : {}), ...(r.business_name ? { businessName: r.business_name } : {}),
    lines: JSON.parse(r.lines), total: r.total, status: r.status, rev: r.rev, modified: !!r.modified,
    confirmedAt: r.confirmed_at, confirmedBy: r.confirmed_by, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

const toValues = (o) => [
  o.id, o.sellerId, o.sellerName, o.date, o.customerName, o.customerCode || null, o.businessName || null, JSON.stringify(o.lines), o.total, o.status, o.rev, o.modified ? 1 : 0,
  o.confirmedAt, o.confirmedBy, o.createdAt, o.updatedAt,
];

export function createD1Store(db) {
  const updates = COLUMNS.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`).join(", ");
  const upsert = `INSERT INTO orders (${COLUMNS.join(", ")}) VALUES (${COLUMNS.map(() => "?").join(", ")}) ON CONFLICT(id) DO UPDATE SET ${updates}`;

  const vendorUpsert = "INSERT INTO vendors (id, name, token, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) "
    + "ON CONFLICT(id) DO UPDATE SET name = excluded.name, token = excluded.token, active = excluded.active, updated_at = excluded.updated_at";

  const accountUpsert = "INSERT INTO accounts (role, username, username_key, salt, hash, active, fail_count, locked_until, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
    + "ON CONFLICT(role) DO UPDATE SET username = excluded.username, username_key = excluded.username_key, salt = excluded.salt, hash = excluded.hash, "
    + "active = excluded.active, fail_count = excluded.fail_count, locked_until = excluded.locked_until, updated_at = excluded.updated_at";

  return {
    // Ajustes (texto) que maneja el administrador, como el horario de facturación.
    async getSetting(key) {
      const r = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first();
      return r ? r.value : null;
    },
    // Varios ajustes en una sola consulta: { clave: texto } con los que existen.
    async getSettings(keys) {
      const { results } = await db.prepare(`SELECT key, value FROM settings WHERE key IN (${keys.map(() => "?").join(", ")})`).bind(...keys).all();
      return Object.fromEntries(results.map((r) => [r.key, r.value]));
    },
    async putSetting(key, value) {
      await db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(key, String(value)).run();
    },
    // Cuentas con usuario y contraseña de ANTES (una por rol): solo se leen para pasarlas a la lista nueva,
    // que vive en los ajustes (ver api.js, loadAccounts).
    async listAccounts() {
      const { results } = await db.prepare("SELECT * FROM accounts ORDER BY role").bind().all();
      return results.map((r) => ({
        role: r.role, username: r.username, usernameKey: r.username_key, salt: r.salt, hash: r.hash, active: !!r.active,
        failCount: r.fail_count, lockedUntil: r.locked_until || null, createdAt: r.created_at, updatedAt: r.updated_at,
      }));
    },
    async putAccount(a) {
      await db.prepare(accountUpsert).bind(a.role, a.username, a.usernameKey, a.salt, a.hash, a.active ? 1 : 0, a.failCount || 0, a.lockedUntil || null, a.createdAt, a.updatedAt).run();
    },
    // La columna `role` de las sesiones guarda el id de la cuenta (antes guardaba el rol, que era el id de la
    // única cuenta de ese rol: las sesiones abiertas de entonces siguen sirviendo).
    async putSession(s) {
      await db.prepare("INSERT OR REPLACE INTO sessions (token_hash, role, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(s.tokenHash, s.accountId, s.createdAt, s.expiresAt).run();
    },
    async getSession(tokenHash) {
      const r = await db.prepare("SELECT * FROM sessions WHERE token_hash = ?").bind(tokenHash).first();
      return r ? { tokenHash: r.token_hash, accountId: r.role, createdAt: r.created_at, expiresAt: r.expires_at } : null;
    },
    async deleteSessionsByAccount(accountId) {
      await db.prepare("DELETE FROM sessions WHERE role = ?").bind(accountId).run();
    },
    async purgeSessions(nowIso) {
      await db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(nowIso).run();
    },
    // Vendedores que maneja el administrador (ver roster.js).
    async listVendors() {
      const { results } = await db.prepare("SELECT * FROM vendors ORDER BY created_at, id").bind().all();
      return results.map((r) => ({ id: r.id, name: r.name, token: r.token, active: !!r.active, createdAt: r.created_at, updatedAt: r.updated_at }));
    },
    async putVendor(v) {
      await db.prepare(vendorUpsert).bind(v.id, v.name, v.token, v.active ? 1 : 0, v.createdAt, v.updatedAt).run();
    },
    async get(id) {
      return fromRow(await db.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first());
    },
    async put(order) {
      await db.prepare(upsert).bind(...toValues(order)).run();
    },
    async listBySeller(sellerId, since) {
      const { results } = await db
        .prepare("SELECT * FROM orders WHERE seller_id = ? AND updated_at > ? ORDER BY updated_at")
        .bind(sellerId, since || "")
        .all();
      return results.map(fromRow);
    },
    async listFrom(desde) {
      const { results } = await db
        .prepare("SELECT * FROM orders WHERE status != 'cancelado' AND date >= ? ORDER BY date DESC, created_at DESC")
        .bind(desde)
        .all();
      return results.map(fromRow);
    },
    async purge(beforeIso) {
      await db.prepare("DELETE FROM orders WHERE updated_at < ?").bind(beforeIso).run();
    },
  };
}
