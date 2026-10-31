// Almacén en memoria con la misma interfaz que d1Store.js. Lo usan las pruebas
// y sirve para probar la API sin base de datos.
export function createMemoryStore() {
  const orders = new Map();
  const copy = (o) => (o ? JSON.parse(JSON.stringify(o)) : null);

  return {
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
