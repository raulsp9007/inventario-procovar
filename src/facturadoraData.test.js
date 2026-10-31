import { describe, it, expect } from "vitest";
import { overlayOps, totalPending, mergeFactOps } from "./facturadoraData";

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
