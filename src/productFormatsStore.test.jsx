import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useInventoryStore } from "./useInventoryStore";
import { DEFAULT_PRODUCT_FORMATS } from "./productFormats";

const STORAGE_KEY = "procovar-inventario-v1";

beforeEach(() => {
  localStorage.clear();
});

async function renderLoadedStore() {
  const view = renderHook(() => useInventoryStore());
  await waitFor(() => expect(view.result.current.loaded).toBe(true));
  return view;
}

function savedState() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY));
}

describe("useInventoryStore -- formatos de venta", () => {
  it("datos nuevos (sin nada guardado) arrancan con la lista de siempre", async () => {
    // Instalación nueva, sin ninguna acción todavía -- nada se persiste solo
    // (mismo comportamiento que products/prices con sus valores por
    // default), pero el estado en memoria ya trae las opciones de siempre.
    const { result } = await renderLoadedStore();
    expect(result.current.productFormats).toEqual(DEFAULT_PRODUCT_FORMATS);
  });

  it("datos guardados antes de esto migran a la lista de siempre, sin perder un formato que ya estuviera en uso", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      movements: [],
      products: [{ code: "P1", name: "Parranda 1500ml", format: "sixpack" }, { code: "P2", name: "Rara", format: "unico" }],
    }));
    const { result } = await renderLoadedStore();
    const codes = result.current.productFormats.map((f) => f.code);
    expect(codes).toEqual(expect.arrayContaining(["sixpack", "paca12u", "unico"]));
    expect(result.current.productFormats.find((f) => f.code === "unico")).toEqual({ code: "unico", units: 1 });
  });

  it("saveProductFormat agrega uno nuevo", async () => {
    const { result } = await renderLoadedStore();
    act(() => { result.current.saveProductFormat({ code: "docena", units: "12" }); });
    await waitFor(() => expect(result.current.productFormats.some((f) => f.code === "docena")).toBe(true));
    expect(savedState().productFormats.some((f) => f.code === "docena")).toBe(true);
  });

  it("saveProductFormat con un nombre ya usado edita las unidades en el lugar", async () => {
    const { result } = await renderLoadedStore();
    act(() => { result.current.saveProductFormat({ code: "sixpack", units: "7" }); });
    await waitFor(() => expect(result.current.productFormats.find((f) => f.code === "sixpack").units).toBe(7));
    expect(result.current.productFormats).toHaveLength(DEFAULT_PRODUCT_FORMATS.length);
  });

  it("saveProductFormat con datos inválidos no cambia la lista y avisa por error", async () => {
    const { result } = await renderLoadedStore();
    const before = result.current.productFormats;
    act(() => { result.current.saveProductFormat({ code: "", units: "12" }); });
    await waitFor(() => expect(result.current.error).toMatch(/nombre/i));
    expect(result.current.productFormats).toBe(before);
  });

  it("deleteProductFormat elimina uno que ningún producto usa", async () => {
    const { result } = await renderLoadedStore();
    act(() => { result.current.deleteProductFormat("paca48u"); });
    await waitFor(() => expect(result.current.productFormats.some((f) => f.code === "paca48u")).toBe(false));
    expect(savedState().productFormats.some((f) => f.code === "paca48u")).toBe(false);
  });

  it("deleteProductFormat no borra uno que un producto tiene puesto, y avisa", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      movements: [],
      products: [{ code: "P1", name: "Parranda 1500ml", format: "sixpack" }],
      productFormats: DEFAULT_PRODUCT_FORMATS,
    }));
    const { result } = await renderLoadedStore();
    act(() => { result.current.deleteProductFormat("sixpack"); });
    await waitFor(() => expect(result.current.error).toMatch(/Parranda 1500ml/));
    expect(result.current.productFormats.some((f) => f.code === "sixpack")).toBe(true);
  });
});
