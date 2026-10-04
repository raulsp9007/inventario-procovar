import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// El redimensionado usa canvas (no existe en jsdom): se sustituye por un
// doble que devuelve una foto ya "reducida". Lo que se prueba acá es el
// hook: cargar lo guardado, guardar, quitar y no romperse sin IndexedDB.
vi.mock("./imageResize", () => ({
  fitWithin: (w, h) => ({ width: w, height: h }),
  resizeImageFile: vi.fn(async () => new Blob(["reducida"], { type: "image/jpeg" })),
}));

import { resizeImageFile } from "./imageResize";
import { putProductImage, getProductImage, listProductImageCodes, deleteProductImage } from "./productImageStore";
import { useProductImages } from "./useProductImages";

let urlCount;

beforeEach(async () => {
  for (const code of await listProductImageCodes()) await deleteProductImage(code);
  urlCount = 0;
  URL.createObjectURL = vi.fn(() => `blob:foto-${++urlCount}`);
  URL.revokeObjectURL = vi.fn();
  resizeImageFile.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useProductImages", () => {
  it("carga las fotos que ya estaban guardadas", async () => {
    await putProductImage("P500", new Blob(["x"], { type: "image/jpeg" }));
    const { result } = renderHook(() => useProductImages());
    await waitFor(() => expect(result.current.urls.P500).toMatch(/^blob:/));
    expect(result.current.urls.OTRO).toBeUndefined();
  });

  it("guardar una foto la reduce, la guarda y la deja disponible", async () => {
    const { result } = renderHook(() => useProductImages());
    const file = new File(["grande"], "foto.jpg", { type: "image/jpeg" });

    let outcome;
    await act(async () => { outcome = await result.current.savePhoto("P500", file); });

    expect(outcome).toEqual({ ok: true });
    expect(resizeImageFile).toHaveBeenCalledWith(file);
    expect(result.current.urls.P500).toMatch(/^blob:/);
    expect((await getProductImage("P500")).size).toBe("reducida".length);
  });

  it("guardar otra foto del mismo producto libera la dirección anterior", async () => {
    const { result } = renderHook(() => useProductImages());
    const file = new File(["a"], "a.jpg", { type: "image/jpeg" });
    await act(async () => { await result.current.savePhoto("P500", file); });
    const first = result.current.urls.P500;
    await act(async () => { await result.current.savePhoto("P500", file); });
    expect(result.current.urls.P500).not.toBe(first);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(first);
  });

  it("quitar la foto la borra del almacenamiento y de la lista", async () => {
    const { result } = renderHook(() => useProductImages());
    const file = new File(["a"], "a.jpg", { type: "image/jpeg" });
    await act(async () => { await result.current.savePhoto("P500", file); });
    const url = result.current.urls.P500;

    await act(async () => { await result.current.removePhoto("P500"); });

    expect(result.current.urls.P500).toBeUndefined();
    expect(await getProductImage("P500")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
  });

  it("getBlob devuelve la foto guardada, o null si no hay", async () => {
    await putProductImage("P500", new Blob(["xyz"], { type: "image/jpeg" }));
    const { result } = renderHook(() => useProductImages());
    expect((await result.current.getBlob("P500")).size).toBe(3);
    expect(await result.current.getBlob("NADA")).toBeNull();
  });

  it("si el redimensionado falla no guarda nada y avisa", async () => {
    resizeImageFile.mockRejectedValueOnce(new Error("no es una imagen"));
    const { result } = renderHook(() => useProductImages());
    let outcome;
    await act(async () => { outcome = await result.current.savePhoto("P500", new File(["x"], "x.txt")); });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toMatch(/foto/i);
    expect(result.current.urls.P500).toBeUndefined();
  });

  it("sin IndexedDB (navegación privada, navegador viejo) no se rompe y guardar avisa", async () => {
    const original = globalThis.indexedDB;
    // eslint-disable-next-line no-global-assign
    Object.defineProperty(globalThis, "indexedDB", { value: undefined, configurable: true });
    try {
      const { result } = renderHook(() => useProductImages());
      expect(result.current.urls).toEqual({});
      let outcome;
      await act(async () => { outcome = await result.current.savePhoto("P500", new File(["x"], "x.jpg", { type: "image/jpeg" })); });
      expect(outcome.ok).toBe(false);
    } finally {
      Object.defineProperty(globalThis, "indexedDB", { value: original, configurable: true });
    }
  });
});
