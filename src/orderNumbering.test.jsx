import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useInventoryStore } from "./useInventoryStore";
import { todayStr, tomorrowStr } from "./dateUtils";

const STORAGE_KEY = "procovar-inventario-v1";

beforeEach(() => {
  localStorage.clear();
});

async function renderLoadedStore() {
  const view = renderHook(() => useInventoryStore());
  await waitFor(() => expect(view.result.current.loaded).toBe(true));
  return view;
}

function orderInput(name, overrides = {}) {
  return {
    customerName: name, businessName: "", customerPhone: "",
    isDelivery: false, note: "", lines: [{ code: "P500", qty: 1 }], bucket: "hoy",
    ...overrides,
  };
}

function seqOf(result, customerName) {
  return result.current.movements.find((m) => m.customerName === customerName)?.orderSeq;
}

async function addOrder(result, name, overrides) {
  const before = result.current.movements.length;
  act(() => { result.current.confirmOrder(orderInput(name, overrides)); });
  await waitFor(() => expect(result.current.movements.length).toBeGreaterThan(before));
}

describe("numeración de pedidos que se reinicia por día", () => {
  it("hoy y mañana empiezan cada uno en #1", async () => {
    const { result } = await renderLoadedStore();
    await addOrder(result, "Ana");
    await addOrder(result, "Beto");
    await addOrder(result, "Carla");
    await addOrder(result, "Rafael", { bucket: "manana", date: tomorrowStr() });
    await addOrder(result, "Luis", { bucket: "manana", date: tomorrowStr() });
    expect([seqOf(result, "Ana"), seqOf(result, "Beto"), seqOf(result, "Carla")]).toEqual([1, 2, 3]);
    expect([seqOf(result, "Rafael"), seqOf(result, "Luis")]).toEqual([1, 2]);
  });

  it("un día programado más adelante también arranca en #1", async () => {
    const { result } = await renderLoadedStore();
    await addOrder(result, "Ana");
    const far = new Date();
    far.setDate(far.getDate() + 3);
    const farStr = `${far.getFullYear()}-${String(far.getMonth() + 1).padStart(2, "0")}-${String(far.getDate()).padStart(2, "0")}`;
    await addOrder(result, "Lejano", { bucket: "manana", date: farStr });
    expect(seqOf(result, "Lejano")).toBe(1);
  });

  it("borrar un pedido no renumera a los demás y el siguiente sigue de la cuenta", async () => {
    const { result } = await renderLoadedStore();
    await addOrder(result, "Ana");
    await addOrder(result, "Beto");
    await addOrder(result, "Carla");
    act(() => { result.current.deleteOrder(result.current.movements.find((m) => m.customerName === "Ana").orderId); });
    await waitFor(() => expect(seqOf(result, "Ana")).toBeUndefined());
    expect([seqOf(result, "Beto"), seqOf(result, "Carla")]).toEqual([2, 3]);
    await addOrder(result, "Diana");
    expect(seqOf(result, "Diana")).toBe(4);
  });

  it("un pedido que se pospone para mañana toma el siguiente número de mañana", async () => {
    const { result } = await renderLoadedStore();
    await addOrder(result, "Ana");
    await addOrder(result, "Beto");
    await addOrder(result, "Rafael", { bucket: "manana", date: tomorrowStr() });
    const beto = result.current.movements.find((m) => m.customerName === "Beto");
    act(() => {
      result.current.editOrder(beto.orderId, orderInput("Beto", { bucket: "manana", date: tomorrowStr(), forceSent: false }));
    });
    await waitFor(() => expect(result.current.movements.find((m) => m.customerName === "Beto").date).toBe(tomorrowStr()));
    expect(seqOf(result, "Beto")).toBe(2);
    expect(seqOf(result, "Rafael")).toBe(1);
  });

  it("un pedido a un día vacío queda como #1 aunque antes tuviera otro número", async () => {
    const { result } = await renderLoadedStore();
    await addOrder(result, "Ana");
    await addOrder(result, "Beto");
    const beto = result.current.movements.find((m) => m.customerName === "Beto");
    act(() => {
      result.current.editOrder(beto.orderId, orderInput("Beto", { bucket: "manana", date: tomorrowStr(), forceSent: false }));
    });
    await waitFor(() => expect(result.current.movements.find((m) => m.customerName === "Beto").date).toBe(tomorrowStr()));
    expect(seqOf(result, "Beto")).toBe(1);
  });

  it("editar un pedido sin cambiar de día conserva su número", async () => {
    const { result } = await renderLoadedStore();
    await addOrder(result, "Ana");
    await addOrder(result, "Beto");
    const ana = result.current.movements.find((m) => m.customerName === "Ana");
    act(() => { result.current.editOrder(ana.orderId, orderInput("Ana", { lines: [{ code: "P500", qty: 5 }] })); });
    await waitFor(() => expect(result.current.movements.find((m) => m.customerName === "Ana").qty).toBe(5));
    expect(seqOf(result, "Ana")).toBe(1);
  });

  it("una venta manual toma el siguiente número de hoy", async () => {
    const { result } = await renderLoadedStore();
    await addOrder(result, "Ana");
    act(() => { result.current.registerManualSale("P500", 1); });
    await waitFor(() => expect(result.current.movements.length).toBe(2));
    expect(result.current.movements.find((m) => m.customerName === "Venta manual").orderSeq).toBe(2);
  });
});

describe("migración de la numeración global a diaria", () => {
  function mv(overrides) {
    return { id: `m-${Math.random()}`, type: "venta", code: "P500", qty: 1, unitPrice: 0, unitHl: 0, bucket: "hoy", sent: false, ...overrides };
  }

  it("renumera desde 1 los pedidos de hoy y futuros, y deja los anteriores", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      movements: [
        mv({ orderId: "old", orderSeq: 30, date: "2020-01-01", timestamp: "2020-01-01T10:00:00.000Z", customerName: "Viejo" }),
        mv({ orderId: "h1", orderSeq: 41, date: todayStr(), timestamp: new Date(Date.now() - 3600000).toISOString(), customerName: "Hoy1" }),
        mv({ orderId: "h2", orderSeq: 42, date: todayStr(), timestamp: new Date(Date.now() - 1800000).toISOString(), customerName: "Hoy2" }),
        mv({ orderId: "m1", orderSeq: 43, date: tomorrowStr(), bucket: "manana", timestamp: new Date(Date.now() - 900000).toISOString(), customerName: "Man1" }),
      ],
    }));
    const { result } = await renderLoadedStore();
    expect(seqOf(result, "Viejo")).toBe(30);
    expect([seqOf(result, "Hoy1"), seqOf(result, "Hoy2")]).toEqual([1, 2]);
    expect(seqOf(result, "Man1")).toBe(1);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).orderSeqPerDay).toBe(true));
  });

  it("no vuelve a renumerar en la siguiente carga", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      orderSeqPerDay: true,
      movements: [
        mv({ orderId: "h1", orderSeq: 41, date: todayStr(), timestamp: new Date().toISOString(), customerName: "Hoy1" }),
      ],
    }));
    const { result } = await renderLoadedStore();
    expect(seqOf(result, "Hoy1")).toBe(41);
  });

  it("los guardados posteriores conservan la marca de migración", async () => {
    const { result } = await renderLoadedStore();
    await addOrder(result, "Ana");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).orderSeqPerDay).toBe(true);
  });
});
