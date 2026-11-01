import { describe, it, expect } from "vitest";
import { overlayOps, totalPending, mergeFactOps, mergeKnownSellers, flattenOrders, filterOrders, tabCounts } from "./facturadoraData";

// Datos de la app de la facturadora: lo que ve ya incluye sus 👍 pendientes de
// enviar (para que al confirmar sin internet el pedido se vea confirmado).

const order = (id, over = {}) => ({
  id, sellerId: "carlos", sellerName: "Carlos Pérez", date: "2026-10-30", customerName: `Cliente ${id}`, total: 100, lines: [],
  status: "pendiente", rev: 1, modified: false, confirmedAt: null, confirmedBy: null, createdAt: "x", updatedAt: "x", ...over,
});
const sellers = () => [
  { id: "carlos", name: "Carlos Pérez", pending: 2, confirmed: 1, orders: [order("a"), order("b"), order("c", { status: "confirmado", confirmedBy: "facturadora", confirmedAt: "2026-10-30T10:00:00.000Z" })] },
  { id: "marta", name: "Marta Díaz", pending: 1, confirmed: 0, orders: [order("d", { sellerId: "marta", sellerName: "Marta Díaz" })] },
];
const NOW = "2026-10-30T16:00:00.000Z";

describe("overlayOps", () => {
  it("sin operaciones pendientes deja todo igual", () => {
    expect(overlayOps(sellers(), [], NOW)).toEqual(sellers());
  });

  it("un 👍 pendiente de enviar ya se ve confirmado, con sus contadores", () => {
    const out = overlayOps(sellers(), [{ kind: "confirm", ids: ["a", "d"] }], NOW);
    expect(out[0].orders.find((o) => o.id === "a")).toMatchObject({ status: "confirmado", confirmedBy: "facturadora", confirmedAt: NOW, modified: false });
    expect(out[0]).toMatchObject({ pending: 1, confirmed: 2 });
    expect(out[1]).toMatchObject({ pending: 0, confirmed: 1 });
  });

  it("un deshacer pendiente vuelve el pedido a sin confirmar", () => {
    const out = overlayOps(sellers(), [{ kind: "unconfirm", ids: ["c"] }], NOW);
    expect(out[0].orders.find((o) => o.id === "c")).toMatchObject({ status: "pendiente", confirmedAt: null, confirmedBy: null });
    expect(out[0]).toMatchObject({ pending: 3, confirmed: 0 });
  });

  it("las operaciones se aplican en orden (confirmar y luego deshacer)", () => {
    const out = overlayOps(sellers(), [{ kind: "confirm", ids: ["a"] }, { kind: "unconfirm", ids: ["a"] }], NOW);
    expect(out[0].orders.find((o) => o.id === "a").status).toBe("pendiente");
  });

  it("ids que no existen se ignoran y los datos originales no se tocan", () => {
    const original = sellers();
    const snapshot = JSON.stringify(original);
    overlayOps(original, [{ kind: "confirm", ids: ["nada"] }], NOW);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it("no confirma un pedido que el vendedor confirmó a mano (queda como estaba)", () => {
    const base = sellers();
    base[0].orders[0] = order("a", { status: "confirmado", confirmedBy: "vendedor", confirmedAt: "2026-10-30T09:00:00.000Z" });
    base[0].pending = 1; base[0].confirmed = 2;
    const out = overlayOps(base, [{ kind: "confirm", ids: ["a"] }], NOW);
    expect(out[0].orders[0]).toMatchObject({ confirmedBy: "vendedor", confirmedAt: "2026-10-30T09:00:00.000Z" });
  });
});

// La página muestra siempre a los vendedores actuales, por orden alfabético.
describe("mergeKnownSellers", () => {
  const KNOWN = ["Lorenzo", "Leodanis", "Melisa", "Niurka", "Raul", "Eddy"];
  const seller = (id, name, pending = 0, confirmed = 0) => ({ id, name, pending, confirmed, orders: [] });
  const names = (list) => list.map((s) => s.name);

  it("sin datos del buzón muestra a todos, alfabéticamente, sin pedidos", () => {
    const list = mergeKnownSellers([], KNOWN);
    expect(names(list)).toEqual(["Eddy", "Leodanis", "Lorenzo", "Melisa", "Niurka", "Raul"]);
    expect(list.every((s) => s.pending === 0 && s.confirmed === 0 && s.orders.length === 0)).toBe(true);
  });

  it("usa lo que trae el buzón para los que ya tienen pedidos, sin repetirlos", () => {
    const list = mergeKnownSellers([seller("raul", "Raul", 2, 1), seller("eddy", "Eddy", 0, 3)], KNOWN);
    expect(names(list)).toEqual(["Eddy", "Leodanis", "Lorenzo", "Melisa", "Niurka", "Raul"]);
    expect(list.find((s) => s.name === "Raul")).toMatchObject({ id: "raul", pending: 2, confirmed: 1 });
    expect(list.find((s) => s.name === "Eddy")).toMatchObject({ pending: 0, confirmed: 3 });
  });

  it("reconoce al mismo vendedor sin importar tildes, mayúsculas o si el buzón trae el apellido", () => {
    const list = mergeKnownSellers([seller("raul-salgado", "Raúl Salgado", 1), seller("m", "MELISA", 4)], KNOWN);
    expect(list).toHaveLength(6);
    expect(list.find((s) => s.id === "raul-salgado")).toMatchObject({ pending: 1 });
    expect(list.find((s) => s.id === "m")).toMatchObject({ pending: 4 });
  });

  it("un vendedor del buzón que no está en la lista también aparece, en su lugar alfabético", () => {
    const list = mergeKnownSellers([seller("carlos", "Carlos Pérez", 1)], KNOWN);
    expect(names(list)).toEqual(["Carlos Pérez", "Eddy", "Leodanis", "Lorenzo", "Melisa", "Niurka", "Raul"]);
  });

  it("el orden ignora tildes: 'Álvaro' va antes que 'Beto'", () => {
    expect(names(mergeKnownSellers([seller("a", "Álvaro"), seller("b", "Beto")], []))).toEqual(["Álvaro", "Beto"]);
  });

  it("no modifica lo que recibe", () => {
    const input = [seller("raul", "Raul", 2)];
    const snapshot = JSON.stringify(input);
    mergeKnownSellers(input, KNOWN);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

// Vista de escritorio: todos los pedidos juntos en una tabla, con filtro por vendedor,
// pestaña (sin confirmar / todos / confirmados) y búsqueda.
describe("vista de escritorio: tabla de pedidos", () => {
  const ord = (id, over = {}) => ({
    id, customerName: `Cliente ${id}`, businessName: "", customerCode: "", total: 100, lines: [], date: "2026-10-30",
    status: "pendiente", modified: false, createdAt: `2026-10-30T0${id.length}:00:00.000Z`, ...over,
  });
  const seller = (id, name, orders) => ({ id, name, orders, pending: orders.filter((o) => o.status === "pendiente").length, confirmed: orders.filter((o) => o.status === "confirmado").length });
  const sellers = () => [
    seller("eddy", "Eddy", []),
    seller("raul", "Raul", [ord("b", { createdAt: "2026-10-30T10:00:00.000Z", customerCode: "LT05TCP0932", businessName: "Kiosco El Sol", customerName: "Ana López" }), ord("a", { createdAt: "2026-10-30T08:00:00.000Z", status: "confirmado" })]),
    seller("melisa", "Melisa", [ord("c", { createdAt: "2026-10-30T09:00:00.000Z", customerName: "Beto Ruiz", customerCode: "LT05TCP0483" })]),
  ];

  describe("flattenOrders", () => {
    it("junta los pedidos de todos, cada uno con su vendedor, del más viejo al más nuevo", () => {
      const list = flattenOrders(sellers());
      expect(list.map((o) => o.id)).toEqual(["a", "c", "b"]);
      expect(list.map((o) => o.sellerName)).toEqual(["Raul", "Melisa", "Raul"]);
      expect(list.map((o) => o.sellerId)).toEqual(["raul", "melisa", "raul"]);
    });

    it("sin pedidos da una lista vacía y no modifica lo que recibe", () => {
      expect(flattenOrders([seller("eddy", "Eddy", [])])).toEqual([]);
      const input = sellers();
      const snapshot = JSON.stringify(input);
      flattenOrders(input);
      expect(JSON.stringify(input)).toBe(snapshot);
    });
  });

  describe("filterOrders", () => {
    const all = () => flattenOrders(sellers());

    it("pestañas: sin confirmar, confirmados y todos", () => {
      expect(filterOrders(all(), { tab: "sin" }).map((o) => o.id)).toEqual(["c", "b"]);
      expect(filterOrders(all(), { tab: "ok" }).map((o) => o.id)).toEqual(["a"]);
      expect(filterOrders(all(), { tab: "todos" }).map((o) => o.id)).toEqual(["a", "c", "b"]);
    });

    it("por vendedor (y 'todos' o vacío deja a todos)", () => {
      expect(filterOrders(all(), { tab: "todos", sellerId: "raul" }).map((o) => o.id)).toEqual(["a", "b"]);
      expect(filterOrders(all(), { tab: "todos", sellerId: "todos" })).toHaveLength(3);
      expect(filterOrders(all(), { tab: "todos", sellerId: "" })).toHaveLength(3);
    });

    it("la búsqueda mira cliente, negocio, código y vendedor, sin importar tildes ni mayúsculas", () => {
      const q = (query) => filterOrders(all(), { tab: "todos", query }).map((o) => o.id);
      expect(q("lopez")).toEqual(["b"]);
      expect(q("KIOSCO sol")).toEqual(["b"]);
      expect(q("lt05tcp0483")).toEqual(["c"]);
      expect(q("melisa")).toEqual(["c"]);
      expect(q("  ")).toEqual(["a", "c", "b"]);
      expect(q("nadie")).toEqual([]);
    });

    it("se combinan: vendedor + pestaña + búsqueda", () => {
      expect(filterOrders(all(), { tab: "sin", sellerId: "raul", query: "ana" }).map((o) => o.id)).toEqual(["b"]);
      expect(filterOrders(all(), { tab: "ok", sellerId: "melisa" })).toEqual([]);
    });
  });

  describe("tabCounts", () => {
    it("cuenta cada pestaña dentro del vendedor elegido", () => {
      const all = flattenOrders(sellers());
      expect(tabCounts(all, "todos")).toEqual({ sin: 2, todos: 3, ok: 1 });
      expect(tabCounts(all, "raul")).toEqual({ sin: 1, todos: 2, ok: 1 });
      expect(tabCounts(all, "eddy")).toEqual({ sin: 0, todos: 0, ok: 0 });
    });
  });
});

describe("totalPending", () => {
  it("suma los pendientes de todos los vendedores", () => {
    expect(totalPending(sellers())).toBe(3);
    expect(totalPending([])).toBe(0);
  });
});

describe("mergeFactOps", () => {
  it("agrega operaciones a la cola sin tocar la original", () => {
    const queue = [{ kind: "confirm", ids: ["a"] }];
    const next = mergeFactOps(queue, { kind: "confirm", ids: ["b"] });
    expect(next).toEqual([{ kind: "confirm", ids: ["a"] }, { kind: "confirm", ids: ["b"] }]);
    expect(queue).toHaveLength(1);
  });

  it("confirmar y deshacer lo mismo sin conexión se compensan", () => {
    const merged = mergeFactOps([{ kind: "confirm", ids: ["a", "b"] }], { kind: "unconfirm", ids: ["a"] });
    expect(merged).toEqual([{ kind: "confirm", ids: ["b"] }]);
  });

  it("deshacer algo que no estaba en cola se conserva (ya está confirmado en la nube)", () => {
    expect(mergeFactOps([], { kind: "unconfirm", ids: ["a"] })).toEqual([{ kind: "unconfirm", ids: ["a"] }]);
  });

  it("confirmar de nuevo algo cuyo deshacer esperaba en cola lo compensa", () => {
    expect(mergeFactOps([{ kind: "unconfirm", ids: ["a"] }], { kind: "confirm", ids: ["a"] })).toEqual([]);
  });
});
