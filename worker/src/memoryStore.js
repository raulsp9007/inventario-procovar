// Almacén en memoria con la misma interfaz que d1Store.js. Lo usan las pruebas
// y sirve para probar la API sin base de datos.
export function createMemoryStore() {
  const orders = new Map();
  const vendors = new Map();
  const accounts = new Map();
  const sessions = new Map();
  const settings = new Map();
  const copy = (o) => (o ? JSON.parse(JSON.stringify(o)) : null);

  return {
    // Vendedores que maneja el administrador (ver roster.js).
    async listVendors() {
      return [...vendors.values()].map(copy);
    },
    async putVendor(vendor) {
      vendors.set(vendor.id, copy(vendor));
    },
    // Ajustes (texto) que maneja el administrador, como el horario de facturación.
    async getSetting(key) {
      return settings.has(key) ? settings.get(key) : null;
    },
    async putSetting(key, value) {
      settings.set(key, String(value));
    },
    // Varios ajustes de una vez: { clave: texto } con los que existen.
    async getSettings(keys) {
      return Object.fromEntries(keys.filter((key) => settings.has(key)).map((key) => [key, settings.get(key)]));
    },
    // Cuentas con usuario y contraseña de ANTES (una por rol): solo se leen para pasarlas a la lista nueva,
    // que vive en los ajustes (ver api.js, loadAccounts).
    async listAccounts() {
      return [...accounts.values()].map(copy);
    },
    async putAccount(account) {
      accounts.set(account.role, copy(account));
    },
    async putSession(session) {
      sessions.set(session.tokenHash, copy(session));
    },
    async getSession(tokenHash) {
      return copy(sessions.get(tokenHash));
    },
    async deleteSessionsByAccount(accountId) {
      for (const [hash, s] of sessions) if (s.accountId === accountId) sessions.delete(hash);
    },
    async purgeSessions(nowIso) {
      for (const [hash, s] of sessions) if (s.expiresAt <= nowIso) sessions.delete(hash);
    },
    async get(id) {
      return copy(orders.get(id));
    },
    async put(order) {
      orders.set(order.id, copy(order));
    },
    // Pedidos de un vendedor cambiados después de `since` (todos si no hay).
    async listBySeller(sellerId, since) {
      return [...orders.values()].filter((o) => o.sellerId === sellerId && (!since || o.updatedAt > since)).map(copy);
    },
    // Pedidos no cancelados con fecha desde `desde` (inclusive).
    async listFrom(desde) {
      return [...orders.values()].filter((o) => o.status !== "cancelado" && o.date >= desde).map(copy);
    },
    async purge(beforeIso) {
      for (const [id, o] of orders) if (o.updatedAt < beforeIso) orders.delete(id);
    },
    dump() {
      return [...orders.values()].map(copy);
    },
  };
}
