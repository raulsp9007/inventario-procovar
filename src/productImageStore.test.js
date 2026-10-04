import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { fitWithin } from "./imageResize";
import {
  putProductImage, getProductImage, deleteProductImage, listProductImageCodes,
} from "./productImageStore";

// Las fotos de los productos NO van en localStorage (se llenaría): viven en
// IndexedDB, aparte del estado de la app y de los respaldos.

describe("fitWithin", () => {
  it("achica para que el lado más largo mida el máximo, conservando la proporción", () => {
    expect(fitWithin(4000, 3000, 800)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(3000, 4000, 800)).toEqual({ width: 600, height: 800 });
  });

  it("nunca agranda una imagen que ya es chica", () => {
    expect(fitWithin(500, 400, 800)).toEqual({ width: 500, height: 400 });
    expect(fitWithin(800, 800, 800)).toEqual({ width: 800, height: 800 });
  });

  it("devuelve enteros", () => {
    const { width, height } = fitWithin(1000, 333, 800);
    expect(Number.isInteger(width)).toBe(true);
    expect(Number.isInteger(height)).toBe(true);
    expect(width).toBe(800);
  });
});

describe("productImageStore", () => {
  beforeEach(async () => {
    for (const code of await listProductImageCodes()) await deleteProductImage(code);
  });

  it("guarda una foto y la devuelve con el mismo tipo y contenido", async () => {
    await putProductImage("P500", new Blob(["hola"], { type: "image/jpeg" }));
    const back = await getProductImage("P500");
    expect(back.type).toBe("image/jpeg");
    expect(back.size).toBe(4);
  });

  it("un producto sin foto devuelve null", async () => {
    expect(await getProductImage("NADA")).toBeNull();
  });

  it("guardar de nuevo reemplaza la foto anterior", async () => {
    await putProductImage("P500", new Blob(["uno"], { type: "image/jpeg" }));
    await putProductImage("P500", new Blob(["dos-dos"], { type: "image/jpeg" }));
    expect((await getProductImage("P500")).size).toBe(7);
    expect(await listProductImageCodes()).toEqual(["P500"]);
  });

  it("lista los códigos con foto y borra solo esa foto", async () => {
    await putProductImage("P500", new Blob(["a"], { type: "image/jpeg" }));
    await putProductImage("M330", new Blob(["b"], { type: "image/jpeg" }));
    expect((await listProductImageCodes()).sort()).toEqual(["M330", "P500"]);

    await deleteProductImage("P500");
    expect(await listProductImageCodes()).toEqual(["M330"]);
    expect(await getProductImage("P500")).toBeNull();
  });
});
