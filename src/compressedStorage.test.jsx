import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { CompressionStream as NodeCompressionStream, DecompressionStream as NodeDecompressionStream } from "node:stream/web";
import { useInventoryStore, MOVEMENTS_CAP } from "./useInventoryStore";
import { decodeFromStorage, isCompressed } from "./storage";

// El estado grande se guarda comprimido y todo lo demás (cargar, copia diaria,
// restaurar, datos dañados) sigue funcionando igual.

const STORAGE_KEY = "procovar-inventario-v1";
const PREV_KEY = "procovar-inventario-v1-prev";
const PREV_AT_KEY = "procovar-inventario-v1-prev-at";
const CORRUPT_KEY = "procovar-inventario-v1-corrupt";

function movement(i) {
  return {
    id: `m-${i}`, code: "P500", type: "venta", qty: 1, unitPrice: 100, unitHl: 0, date: "2026-08-15",
    timestamp: `2026-08-15T10:${String(i % 60).padStart(2, "0")}:00.000Z`, orderId: `o-${i}`, orderSeq: 1,
    customerName: `Cliente ${i % 40}`, businessName: "", customerPhone: "", isDelivery: false, note: "",
    bucket: "hoy", sent: true, confirmed: true, sentToCustomer: true,
  };
}

function bigState(n = 1200) {
  return {
    movements: Array.from({ length: n }, (_, i) => movement(i)),
    customers: [], orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: { P500: 50 }, prices: { P500: 1 }, pricesAreUsd: true, exchangeRate: 100,
  };
}

async function renderLoadedStore() {
  const view = renderHook(() => useInventoryStore());
  await waitFor(() => expect(view.result.current.loaded).toBe(true));
  return view;
}

function newOrder() {
  return {
    customerName: "Nuevo", businessName: "", customerPhone: "", isDelivery: false, note: "",
    lines: [{ code: "P500", qty: 1 }], bucket: "hoy",
  };
}

async function storedPlain(key) {
  return JSON.parse(await decodeFromStorage(localStorage.getItem(key)));
}

// Espera a que lo guardado (descomprimido) tenga esa cantidad de movimientos:
// al cargar datos viejos la app ya hace un primer guardado por migraciones,
// así que "está comprimido" solo no prueba que se guardó la última acción.
async function waitForStoredMovements(key, count) {
  await waitFor(async () => expect((await storedPlain(key)).movements).toHaveLength(count));
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("CompressionStream", NodeCompressionStream);
  vi.stubGlobal("DecompressionStream", NodeDecompressionStream);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("tope de movimientos", () => {
  it("el tope es 20.000", () => {
    expect(MOVEMENTS_CAP).toBe(20000);
  });
});

describe("guardado comprimido", () => {
  it("datos grandes guardados como JSON plano (versión anterior) se leen, y el próximo guardado los comprime", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bigState()));
    const { result } = await renderLoadedStore();
    expect(result.current.movements).toHaveLength(1200);

    act(() => { result.current.confirmOrder(newOrder()); });
    await waitForStoredMovements(STORAGE_KEY, 1201);
    expect(isCompressed(localStorage.getItem(STORAGE_KEY))).toBe(true);
  });

  it("al reabrir la app los datos comprimidos se cargan completos", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bigState()));
    const first = await renderLoadedStore();
    act(() => { first.result.current.confirmOrder(newOrder()); });
    await waitForStoredMovements(STORAGE_KEY, 1201);
    expect(isCompressed(localStorage.getItem(STORAGE_KEY))).toBe(true);
    first.unmount();

    const second = await renderLoadedStore();
    expect(second.result.current.movements).toHaveLength(1201);
    expect(second.result.current.loadProblem).toBeNull();
    expect(second.result.current.stock.P500).toBe(49);
  });

  it("datos chicos siguen guardándose como JSON plano legible", async () => {
    const { result } = await renderLoadedStore();
    act(() => { result.current.confirmOrder(newOrder()); });
    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy());
    expect(isCompressed(localStorage.getItem(STORAGE_KEY))).toBe(false);
  });

  it("varias acciones seguidas terminan con la última guardada (ningún guardado viejo pisa a uno nuevo)", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bigState()));
    const { result } = await renderLoadedStore();
    act(() => { result.current.confirmOrder({ ...newOrder(), customerName: "Uno" }); });
    act(() => { result.current.confirmOrder({ ...newOrder(), customerName: "Dos" }); });
    act(() => { result.current.confirmOrder({ ...newOrder(), customerName: "Tres" }); });
    await waitFor(() => expect(result.current.movements).toHaveLength(1203));
    await waitForStoredMovements(STORAGE_KEY, 1203);
  });
});

describe("protección de los datos con compresión", () => {
  it("datos comprimidos ilegibles: no revienta, guarda copia intacta y avisa", async () => {
    localStorage.setItem(STORAGE_KEY, "gz1:@@esto-no-es-base64-valido@@");
    const { result } = await renderLoadedStore();
    expect(result.current.loadProblem).toEqual({ hasPrev: false, prevAt: null });
    expect(localStorage.getItem(CORRUPT_KEY)).toBe("gz1:@@esto-no-es-base64-valido@@");
  });

  it("la copia diaria guarda el estado anterior tal cual estaba (comprimido) y se puede restaurar", async () => {
    // Un estado grande ya guardado comprimido por la app.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bigState()));
    const seed = await renderLoadedStore();
    act(() => { seed.result.current.confirmOrder(newOrder()); });
    await waitForStoredMovements(STORAGE_KEY, 1201);
    expect(isCompressed(localStorage.getItem(STORAGE_KEY))).toBe(true);
    seed.unmount();
    const compressedBefore = localStorage.getItem(STORAGE_KEY);

    // Ayer fue la última copia: el primer guardado de hoy toma una nueva.
    localStorage.setItem(PREV_AT_KEY, "2020-01-01T00:00:00.000Z");
    const { result } = await renderLoadedStore();
    act(() => { result.current.confirmOrder({ ...newOrder(), customerName: "Otro" }); });
    await waitFor(() => expect(localStorage.getItem(PREV_KEY)).toBe(compressedBefore));
    await waitFor(() => expect(result.current.movements).toHaveLength(1202));

    let ok;
    await act(async () => { ok = await result.current.restorePreviousCopy(); });
    expect(ok).toBe(true);
    await waitFor(() => expect(result.current.movements).toHaveLength(1201));
    // Restaurar vuelve a guardar (comprimiendo, que es asíncrono): se espera a
    // que termine para que no escriba en el almacenamiento del test siguiente.
    await waitForStoredMovements(STORAGE_KEY, 1201);
    await waitFor(() => expect(result.current.saveState).not.toBe("saving"));
  });

  it("no toma copia diaria de un guardado ilegible", async () => {
    localStorage.setItem(STORAGE_KEY, "gz1:@@@");
    const { result } = await renderLoadedStore();
    act(() => { result.current.confirmOrder(newOrder()); });
    await waitFor(() => expect(result.current.movements).toHaveLength(1));
    expect(localStorage.getItem(PREV_KEY)).toBeNull();
  });
});
