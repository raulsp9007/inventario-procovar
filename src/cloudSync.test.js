import { describe, it, expect, vi } from "vitest";
import { CloudError } from "./cloudApi";
import { toCloudContent, reconcile, applyStatuses, mergeOps, flushQueue, chipFor, markRejected } from "./cloudSync";

// Sincronización del vendedor con la nube de facturación. Piezas puras:
//  - reconcile: qué hay que subir, borrar o confirmar según los pedidos de hoy.
//  - applyStatuses: qué confirmó la facturadora y hay que marcar en la app.
//  - mergeOps / flushQueue: la cola de envíos (sin internet se acumula).

const products = [
  { code: "P500", name: "Parranda 500ml", short: "P-500" },
  { code: "M330", name: "Malta 330ml", short: "M-330" },
];

const order = (over = {}) => ({
  orderId: "o1", date: "2026-10-30", customerName: "Ana López", isDelivery: false, sent: true, confirmed: false,
  lines: [{ code: "P500", qty: 40, unitPrice: 120 }, { code: "M330", qty: 30, unitPrice: 80 }],
  ...over,
});

describe("toCloudContent", () => {
  it("lleva solo lo necesario: cliente, fecha, productos con nombre y total", () => {
    expect(toCloudContent(order(), products)).toEqual({
      customerName: "Ana López", date: "2026-10-30", total: 7200,
      lines: [
        { code: "P500", name: "Parranda 500ml", qty: 40, unitPrice: 120 },
        { code: "M330", name: "Malta 330ml", qty: 30, unitPrice: 80 },
      ],
    });
  });

  it("un producto que ya no existe usa su código como nombre", () => {
    const content = toCloudContent(order({ lines: [{ code: "GONE", qty: 2, unitPrice: 10 }] }), products);
    expect(content.lines[0].name).toBe("GONE");
  });

  it("no incluye teléfono ni notas", () => {
    const content = toCloudContent(order({ customerPhone: "5353551234", note: "puerta" }), products);
    expect(JSON.stringify(content)).not.toMatch(/5353551234|puerta/);
  });

  // La facturadora busca al cliente por su código del portal y su negocio.
  it("lleva el código del cliente (del registro) y el negocio del pedido, si los hay", () => {
    const customers = [{ id: "c1", name: "Ana López", businessName: "Kiosco Sol", phone: "", code: "AB1001" }];
    const content = toCloudContent(order({ businessName: "Kiosco El Sol" }), products, customers);
    expect(content).toMatchObject({ customerCode: "AB1001", businessName: "Kiosco El Sol" });
  });

  it("sin negocio en el pedido usa el del registro", () => {
    const customers = [{ id: "c1", name: "Ana López", businessName: "Kiosco Sol", phone: "" }];
    expect(toCloudContent(order(), products, customers)).toMatchObject({ businessName: "Kiosco Sol" });
  });

  it("sin código ni negocio no agrega esos campos", () => {
    const content = toCloudContent(order(), products, [{ id: "c1", name: "Ana López", businessName: "", phone: "" }]);
    expect(content).not.toHaveProperty("customerCode");
    expect(content).not.toHaveProperty("businessName");
  });

  it("ponerle el código a un cliente ya subido vuelve a subir su pedido (el buzón lo actualiza sin reabrirlo)", () => {
    const first = reconcile({ orders: [order()], products, customers: [], map: {} });
    const later = reconcile({ orders: [order()], products, customers: [{ id: "c1", name: "Ana López", businessName: "", phone: "", code: "AB1001" }], map: first.nextMap });
    expect(later.ops.map((o) => o.kind)).toEqual(["put"]);
    expect(later.ops[0].content.customerCode).toBe("AB1001");
  });
});

describe("reconcile: qué subir", () => {
  it("sube el pedido enviado a facturación que la nube todavía no tiene", () => {
    const { ops, nextMap } = reconcile({ orders: [order()], products, map: {} });
    expect(ops).toEqual([{ kind: "put", orderId: "o1", content: toCloudContent(order(), products) }]);
    expect(nextMap.o1).toMatchObject({ published: true, status: "pendiente" });
  });

  it("no sube lo que no está enviado a facturación ni los domicilios", () => {
    const { ops } = reconcile({ orders: [order({ sent: false }), order({ orderId: "o2", isDelivery: true })], products, map: {} });
    expect(ops).toEqual([]);
  });

  it("no repite lo que ya subió y no cambió", () => {
    const first = reconcile({ orders: [order()], products, map: {} });
    const again = reconcile({ orders: [order()], products, map: first.nextMap });
    expect(again.ops).toEqual([]);
  });

  it("si cambia el contenido, lo sube de nuevo", () => {
    const first = reconcile({ orders: [order()], products, map: {} });
    const edited = order({ lines: [{ code: "P500", qty: 80, unitPrice: 120 }] });
    const { ops, nextMap } = reconcile({ orders: [edited], products, map: first.nextMap });
    expect(ops.map((o) => o.kind)).toEqual(["put"]);
    expect(nextMap.o1.status).toBe("pendiente");
  });

  it("si lo des-envía o lo elimina, avisa a la nube (cancelado)", () => {
    const first = reconcile({ orders: [order()], products, map: {} });
    const unsent = reconcile({ orders: [order({ sent: false })], products, map: first.nextMap });
    expect(unsent.ops).toEqual([{ kind: "delete", orderId: "o1" }]);
    expect(unsent.nextMap.o1).toMatchObject({ published: false, status: "cancelado" });
    const removed = reconcile({ orders: [], products, map: first.nextMap });
    expect(removed.ops).toEqual([{ kind: "delete", orderId: "o1" }]);
  });

  it("no vuelve a borrar lo ya cancelado", () => {
    const first = reconcile({ orders: [order()], products, map: {} });
    const gone = reconcile({ orders: [], products, map: first.nextMap });
    expect(reconcile({ orders: [], products, map: gone.nextMap }).ops).toEqual([]);
  });

  it("si lo confirma a mano el vendedor, también lo confirma en la nube", () => {
    const first = reconcile({ orders: [order()], products, map: {} });
    const { ops, nextMap } = reconcile({ orders: [order({ confirmed: true })], products, map: first.nextMap });
    expect(ops).toEqual([{ kind: "confirm", orderId: "o1" }]);
    expect(nextMap.o1).toMatchObject({ status: "confirmado", confirmedBy: "vendedor" });
  });

  it("si lo confirmó la facturadora, no hay nada que mandar", () => {
    const map = { o1: { ...reconcile({ orders: [order()], products, map: {} }).nextMap.o1, status: "confirmado", confirmedBy: "facturadora" } };
    expect(reconcile({ orders: [order({ confirmed: true })], products, map }).ops).toEqual([]);
  });

  // Suben los pedidos de hoy y los de días que vienen (los de mañana enviados a facturación ya quedan
  // en la nube, listos para cuando la facturadora abra su sitio ese día). Los de días que ya pasaron
  // no (ni el historial al enlazar).
  describe("pedidos de hoy y de días que vienen", () => {
    const TODAY = "2026-10-30";

    it("sube los de hoy y los de mañana; los de días que ya pasaron no (ni el historial al enlazar)", () => {
      const old = order({ orderId: "viejo", date: "2026-10-29" });
      const tomorrow = order({ orderId: "manana", date: "2026-10-31" });
      const { ops, nextMap } = reconcile({ orders: [old, tomorrow, order()], products, map: {}, today: TODAY });
      expect(ops.map((o) => o.orderId).sort()).toEqual(["manana", "o1"]);
      expect(nextMap.viejo).toBeUndefined();
      expect(nextMap.manana).toMatchObject({ published: true, status: "pendiente" });
    });

    it("también sube un pedido de más adelante (por ejemplo el lunes, si mañana es domingo)", () => {
      const monday = order({ orderId: "lunes", date: "2026-11-02" });
      expect(reconcile({ orders: [monday], products, map: {}, today: TODAY }).ops.map((o) => o.orderId)).toEqual(["lunes"]);
    });

    it("un pedido de mañana que no está enviado a facturación no se sube", () => {
      const tomorrow = order({ orderId: "manana", date: "2026-10-31", sent: false });
      expect(reconcile({ orders: [tomorrow], products, map: {}, today: TODAY }).ops).toEqual([]);
    });

    it("el de mañana, ya subido, no se vuelve a subir cuando llega su día", () => {
      const tomorrow = order({ orderId: "manana", date: "2026-10-31" });
      const first = reconcile({ orders: [tomorrow], products, map: {}, today: TODAY });
      expect(reconcile({ orders: [tomorrow], products, map: first.nextMap, today: "2026-10-31" }).ops).toEqual([]);
    });

    it("un pedido de mañana ya subido, si deja de estar enviado, se borra de la nube", () => {
      const tomorrow = order({ orderId: "manana", date: "2026-10-31" });
      const first = reconcile({ orders: [tomorrow], products, map: {}, today: TODAY });
      expect(reconcile({ orders: [{ ...tomorrow, sent: false }], products, map: first.nextMap, today: TODAY }).ops.map((o) => o.kind)).toEqual(["delete"]);
    });

    it("un pedido ya subido cuyo día pasó se deja quieto: no se borra ni se vuelve a subir", () => {
      const first = reconcile({ orders: [order()], products, map: {}, today: TODAY });
      const nextDay = reconcile({ orders: [order()], products, map: first.nextMap, today: "2026-10-31" });
      expect(nextDay.ops).toEqual([]);
      expect(nextDay.nextMap.o1).toMatchObject({ published: true, status: "pendiente" });
      const edited = order({ lines: [{ code: "P500", qty: 1, unitPrice: 120 }] });
      expect(reconcile({ orders: [edited], products, map: first.nextMap, today: "2026-10-31" }).ops).toEqual([]);
    });

    it("sigue actualizando y borrando los de hoy", () => {
      const first = reconcile({ orders: [order()], products, map: {}, today: TODAY });
      const edited = order({ lines: [{ code: "P500", qty: 1, unitPrice: 120 }] });
      expect(reconcile({ orders: [edited], products, map: first.nextMap, today: TODAY }).ops.map((o) => o.kind)).toEqual(["put"]);
      expect(reconcile({ orders: [order({ sent: false })], products, map: first.nextMap, today: TODAY }).ops.map((o) => o.kind)).toEqual(["delete"]);
    });
  });

  it("subir y confirmar a la vez va en ese orden", () => {
    const { ops } = reconcile({ orders: [order({ confirmed: true })], products, map: {} });
    expect(ops.map((o) => o.kind)).toEqual(["put", "confirm"]);
  });
});

describe("applyStatuses: lo que confirma la facturadora", () => {
  const published = () => reconcile({ orders: [order()], products, map: {} }).nextMap;
  const row = (over = {}) => ({ id: "o1", status: "confirmado", rev: 1, modified: false, confirmedAt: "2026-10-30T15:42:00.000Z", confirmedBy: "facturadora", updatedAt: "2026-10-30T15:42:00.000Z", ...over });

  it("su 👍 marca CONF. en el pedido", () => {
    const { toConfirm, toUnconfirm, nextMap } = applyStatuses({ rows: [row()], orders: [order()], map: published() });
    expect(toConfirm).toEqual(["o1"]);
    expect(toUnconfirm).toEqual([]);
    expect(nextMap.o1).toMatchObject({ status: "confirmado", confirmedBy: "facturadora", confirmedAt: "2026-10-30T15:42:00.000Z", autoConfirmed: true });
  });

  it("si ya estaba confirmado a mano, no hace falta marcarlo", () => {
    const { toConfirm, nextMap } = applyStatuses({ rows: [row()], orders: [order({ confirmed: true })], map: published() });
    expect(toConfirm).toEqual([]);
    expect(nextMap.o1.autoConfirmed).toBe(false);
  });

  it("no lo vuelve a marcar si el vendedor lo desmarcó después", () => {
    const first = applyStatuses({ rows: [row()], orders: [order()], map: published() });
    const again = applyStatuses({ rows: [row()], orders: [order({ confirmed: false })], map: first.nextMap });
    expect(again.toConfirm).toEqual([]);
  });

  it("un 👍 nuevo (otra hora) sí se aplica", () => {
    const first = applyStatuses({ rows: [row()], orders: [order()], map: published() });
    const again = applyStatuses({ rows: [row({ confirmedAt: "2026-10-30T17:00:00.000Z" })], orders: [order({ confirmed: false })], map: first.nextMap });
    expect(again.toConfirm).toEqual(["o1"]);
  });

  it("si ella deshace su 👍, se quita el CONF. que puso la app", () => {
    const first = applyStatuses({ rows: [row()], orders: [order()], map: published() });
    const undone = applyStatuses({
      rows: [row({ status: "pendiente", confirmedAt: null, confirmedBy: null })], orders: [order({ confirmed: true })], map: first.nextMap,
    });
    expect(undone.toUnconfirm).toEqual(["o1"]);
    expect(undone.nextMap.o1).toMatchObject({ status: "pendiente", autoConfirmed: false, appliedAt: null });
  });

  it("si ella deshace pero el vendedor lo había confirmado a mano, no se toca", () => {
    const first = applyStatuses({ rows: [row()], orders: [order({ confirmed: true })], map: published() });
    const undone = applyStatuses({
      rows: [row({ status: "pendiente", confirmedAt: null, confirmedBy: null })], orders: [order({ confirmed: true })], map: first.nextMap,
    });
    expect(undone.toUnconfirm).toEqual([]);
  });

  it("ignora pedidos que esta app no subió y pedidos que ya no existen localmente", () => {
    expect(applyStatuses({ rows: [row({ id: "ajeno" })], orders: [order()], map: published() }).toConfirm).toEqual([]);
    expect(applyStatuses({ rows: [row()], orders: [], map: published() }).toConfirm).toEqual([]);
  });

  it("anota cancelado y la confirmación del propio vendedor", () => {
    const cancelled = applyStatuses({ rows: [row({ status: "cancelado", confirmedAt: null, confirmedBy: null })], orders: [order()], map: published() });
    expect(cancelled.nextMap.o1.status).toBe("cancelado");
    const byMe = applyStatuses({ rows: [row({ confirmedBy: "vendedor" })], orders: [order({ confirmed: true })], map: published() });
    expect(byMe.toConfirm).toEqual([]);
    expect(byMe.nextMap.o1).toMatchObject({ status: "confirmado", confirmedBy: "vendedor" });
  });
});

describe("mergeOps: la cola", () => {
  const put = (id, extra = {}) => ({ kind: "put", orderId: id, content: { total: 1, ...extra } });

  it("un envío nuevo reemplaza al anterior del mismo pedido", () => {
    expect(mergeOps([put("a", { total: 1 })], [put("a", { total: 2 })])).toEqual([put("a", { total: 2 })]);
  });

  it("borrar quita todo lo pendiente de ese pedido", () => {
    const merged = mergeOps([put("a"), { kind: "confirm", orderId: "a" }, put("b")], [{ kind: "delete", orderId: "a" }]);
    expect(merged).toEqual([put("b"), { kind: "delete", orderId: "a" }]);
  });

  it("subir otra vez quita un borrado y un confirmar que estaban esperando", () => {
    const merged = mergeOps([{ kind: "delete", orderId: "a" }, { kind: "confirm", orderId: "a" }], [put("a")]);
    expect(merged).toEqual([put("a")]);
  });

  it("no duplica confirmaciones", () => {
    const c = { kind: "confirm", orderId: "a" };
    expect(mergeOps([c], [c])).toEqual([c]);
  });

  it("no modifica la cola original", () => {
    const queue = [put("a")];
    mergeOps(queue, [put("a", { total: 9 })]);
    expect(queue).toEqual([put("a")]);
  });
});

describe("flushQueue: vaciar la cola", () => {
  const ops = () => [
    { kind: "put", orderId: "a", content: { total: 1 } },
    { kind: "confirm", orderId: "a" },
    { kind: "delete", orderId: "b" },
  ];
  const apiOf = (over = {}) => ({
    putOrder: vi.fn(async () => ({})), confirmOrder: vi.fn(async () => ({})), deleteOrder: vi.fn(async () => ({})), ...over,
  });

  it("manda todo en orden y deja la cola vacía", async () => {
    const api = apiOf();
    const out = await flushQueue({ queue: ops(), api });
    expect(out.remaining).toEqual([]);
    expect(out.sent).toBe(3);
    expect(api.putOrder).toHaveBeenCalledWith("a", { total: 1 });
    expect(api.confirmOrder).toHaveBeenCalledWith("a");
    expect(api.deleteOrder).toHaveBeenCalledWith("b");
  });

  it("un 'put' con queuedAt lo manda como tercer dato (cuándo se hizo el cambio)", async () => {
    const api = apiOf();
    await flushQueue({ queue: [{ kind: "put", orderId: "a", content: { total: 1 }, queuedAt: "2026-10-30T14:50:00.000Z" }], api });
    expect(api.putOrder).toHaveBeenCalledWith("a", { total: 1 }, { queuedAt: "2026-10-30T14:50:00.000Z" });
  });

  it("sin conexión se detiene y conserva lo que falta", async () => {
    const api = apiOf({ confirmOrder: vi.fn(async () => { throw new CloudError("network", 0, "x"); }) });
    const out = await flushQueue({ queue: ops(), api });
    expect(out.remaining.map((o) => o.kind)).toEqual(["confirm", "delete"]);
    expect(out.stopped).toBe("network");
    expect(api.deleteOrder).not.toHaveBeenCalled();
  });

  it("si el código ya no sirve, se detiene y lo avisa", async () => {
    const api = apiOf({ putOrder: vi.fn(async () => { throw new CloudError("auth", 401, "x"); }) });
    const out = await flushQueue({ queue: ops(), api });
    expect(out.stopped).toBe("auth");
    expect(out.remaining).toHaveLength(3);
  });

  it("un fallo del servidor se reintenta después (se conserva)", async () => {
    const api = apiOf({ putOrder: vi.fn(async () => { throw new CloudError("server", 500, "x"); }) });
    const out = await flushQueue({ queue: ops(), api });
    expect(out.stopped).toBe("server");
    expect(out.remaining).toHaveLength(3);
  });

  it("lo que la nube rechaza (400/409/403) se descarta y se reporta, y sigue con lo demás", async () => {
    const api = apiOf({ putOrder: vi.fn(async () => { throw new CloudError("invalid", 400, "Falta el nombre del cliente."); }) });
    const out = await flushQueue({ queue: ops(), api });
    expect(out.remaining).toEqual([]);
    expect(out.rejected).toEqual([{ orderId: "a", kind: "put", message: "Falta el nombre del cliente." }]);
    expect(api.confirmOrder).toHaveBeenCalled();
  });

  it("fuera de horario de facturación se detiene, conserva la cola y trae el mensaje del buzón", async () => {
    const api = apiOf({ putOrder: vi.fn(async () => { throw new CloudError("closed", 423, "La facturación está cerrada. Abre hoy a las 9:00 a. m."); }) });
    const out = await flushQueue({ queue: ops(), api });
    expect(out.stopped).toBe("closed");
    expect(out.stoppedMessage).toBe("La facturación está cerrada. Abre hoy a las 9:00 a. m.");
    expect(out.remaining).toHaveLength(3);
    expect(out.rejected).toEqual([]);
  });

  it("borrar o confirmar algo que no existe en la nube cuenta como hecho", async () => {
    const api = apiOf({
      deleteOrder: vi.fn(async () => { throw new CloudError("notfound", 404, "x"); }),
      confirmOrder: vi.fn(async () => { throw new CloudError("notfound", 404, "x"); }),
    });
    const out = await flushQueue({ queue: ops(), api });
    expect(out.remaining).toEqual([]);
    expect(out.rejected).toEqual([]);
  });
});

describe("chipFor: el estado que se ve en el pedido", () => {
  const entry = (over = {}) => ({ published: true, status: "pendiente", ...over });

  it("sin nube o sin subir, nada", () => {
    expect(chipFor({ entry: undefined, queued: false })).toBeNull();
    expect(chipFor({ entry: entry({ published: false, status: "cancelado" }), queued: false })).toBeNull();
  });

  it("en cola si hay algo esperando para ese pedido", () => {
    expect(chipFor({ entry: entry(), queued: true })).toEqual({ state: "queued", text: "En cola" });
  });

  it("en nube cuando ya subió", () => {
    expect(chipFor({ entry: entry(), queued: false })).toEqual({ state: "cloud", text: "En nube" });
  });

  it("confirmado por facturación con la hora", () => {
    const at = new Date(2026, 9, 30, 10, 42).toISOString();
    expect(chipFor({ entry: entry({ status: "confirmado", confirmedBy: "facturadora", confirmedAt: at }), queued: false })).toEqual({
      state: "confirmed", text: "Confirmado por facturación a las 10:42",
    });
  });

  it("confirmado por el propio vendedor no dice facturación", () => {
    expect(chipFor({ entry: entry({ status: "confirmado", confirmedBy: "vendedor" }), queued: false })).toEqual({ state: "cloud", text: "En nube" });
  });
});

// Un pedido que la nube rechaza (datos inválidos) se marca en su tarjeta, en rojo, con el
// motivo; no se reintenta igual, solo cuando el vendedor lo cambia.
describe("pedidos rechazados por la nube", () => {
  const rejectedEntry = (hash) => ({ hash, published: false, status: "pendiente", rejected: "Falta el nombre del cliente." });

  it("markRejected marca solo los envíos rechazados de pedidos conocidos", () => {
    const map = { a: { hash: "h", published: true, status: "pendiente" }, b: { hash: "h", published: true, status: "pendiente" } };
    const next = markRejected(map, [
      { orderId: "a", kind: "put", message: "Falta el nombre del cliente." },
      { orderId: "b", kind: "confirm", message: "otra cosa" },
      { orderId: "zz", kind: "put", message: "no existe en el mapa" },
    ]);
    expect(next.a).toMatchObject({ published: false, rejected: "Falta el nombre del cliente." });
    expect(next.b).toEqual(map.b);
    expect(next.zz).toBeUndefined();
    expect(map.a.rejected).toBeUndefined();
  });

  it("sin rechazos devuelve el mismo mapa", () => {
    const map = { a: { hash: "h", published: true } };
    expect(markRejected(map, [])).toBe(map);
  });

  it("chipFor: rechazado va primero y trae el motivo", () => {
    expect(chipFor({ entry: rejectedEntry("h"), queued: false })).toEqual({ state: "rejected", text: "Falta el nombre del cliente." });
  });

  it("reconcile no vuelve a mandar un pedido rechazado mientras no cambie", () => {
    const o = order();
    const hash = JSON.stringify(toCloudContent(o, products));
    const out = reconcile({ orders: [o], products, map: { o1: rejectedEntry(hash) }, today: "2026-10-30" });
    expect(out.ops).toEqual([]);
    expect(out.nextMap.o1.rejected).toBe("Falta el nombre del cliente.");
  });

  it("si el vendedor lo cambia, se manda de nuevo y el rechazo se borra", () => {
    const o = order({ lines: [{ code: "P500", qty: 41, unitPrice: 120 }] });
    const out = reconcile({ orders: [o], products, map: { o1: rejectedEntry("hash-viejo") }, today: "2026-10-30" });
    expect(out.ops).toEqual([expect.objectContaining({ kind: "put", orderId: "o1" })]);
    expect(out.nextMap.o1.rejected).toBeUndefined();
    expect(out.nextMap.o1.published).toBe(true);
  });

  it("si deja de estar enviado a facturación, el aviso de rechazo se quita", () => {
    const o = order({ sent: false });
    const out = reconcile({ orders: [o], products, map: { o1: rejectedEntry("h") }, today: "2026-10-30" });
    expect(out.ops).toEqual([]);
    expect(out.nextMap.o1.rejected).toBeFalsy();
    expect(chipFor({ entry: out.nextMap.o1, queued: false })).toBeNull();
  });
});
