import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CompressionStream as NodeCompressionStream, DecompressionStream as NodeDecompressionStream } from "node:stream/web";
import { encodeForStorage, decodeFromStorage, isCompressed, getData, setData, COMPRESS_MIN_CHARS } from "./storage";

// El estado se guarda comprimido (gzip + base64, prefijo "gz1:") cuando es
// grande, para que 20.000 movimientos quepan holgados en localStorage. Lo
// guardado antes (JSON plano) se sigue leyendo siempre.

function bigJson(n = 4000) {
  const movements = Array.from({ length: n }, (_, i) => ({
    id: `m-${i}`, code: "P500", type: "venta", qty: i % 7, unitPrice: 100, date: "2026-09-21",
    customerName: "Cliente de prueba con nombre largo", note: "ñandú áéíóú 🙂",
  }));
  return JSON.stringify({ movements, stock: { P500: 5 } });
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("CompressionStream", NodeCompressionStream);
  vi.stubGlobal("DecompressionStream", NodeDecompressionStream);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("encodeForStorage / decodeFromStorage", () => {
  it("lo chico se guarda tal cual (JSON plano)", async () => {
    const small = JSON.stringify({ a: 1 });
    expect(small.length).toBeLessThan(COMPRESS_MIN_CHARS);
    const stored = await encodeForStorage(small);
    expect(stored).toBe(small);
    expect(isCompressed(stored)).toBe(false);
  });

  it("lo grande se comprime bastante y vuelve idéntico (acentos y emojis incluidos)", async () => {
    const plain = bigJson();
    expect(plain.length).toBeGreaterThan(COMPRESS_MIN_CHARS);
    const stored = await encodeForStorage(plain);
    expect(isCompressed(stored)).toBe(true);
    expect(stored.length).toBeLessThan(plain.length / 4);
    expect(await decodeFromStorage(stored)).toBe(plain);
  });

  it("lo guardado como JSON plano (versiones anteriores) se lee igual", async () => {
    const plain = bigJson(50);
    expect(await decodeFromStorage(plain)).toBe(plain);
  });

  it("sin soporte de compresión en el navegador guarda plano, aunque sea grande", async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("CompressionStream", undefined);
    const plain = bigJson();
    expect(await encodeForStorage(plain)).toBe(plain);
  });

  it("si lo comprimido no vuelve idéntico (códec roto), guarda plano en vez de arriesgar datos", async () => {
    class BrokenDecompression {
      constructor() {
        const ts = new TransformStream({ transform(chunk, controller) { controller.enqueue(chunk.slice(0, chunk.length - 1)); } });
        this.readable = ts.readable;
        this.writable = ts.writable;
      }
    }
    vi.stubGlobal("DecompressionStream", BrokenDecompression);
    const plain = bigJson();
    expect(await encodeForStorage(plain)).toBe(plain);
  });

  it("leer algo comprimido sin soporte de descompresión falla (no devuelve basura)", async () => {
    const stored = await encodeForStorage(bigJson());
    vi.unstubAllGlobals();
    vi.stubGlobal("DecompressionStream", undefined);
    await expect(decodeFromStorage(stored)).rejects.toThrow();
  });
});

describe("setData / getData", () => {
  it("guarda comprimido en localStorage y getData devuelve lo guardado tal cual", async () => {
    const plain = bigJson();
    await setData("k", plain);
    const raw = localStorage.getItem("k");
    expect(isCompressed(raw)).toBe(true);
    expect((await getData("k")).value).toBe(raw);
    expect(await decodeFromStorage(raw)).toBe(plain);
  });

  it("guardados seguidos terminan siempre con el último (uno lento no pisa a uno nuevo)", async () => {
    const big = bigJson();
    const small = JSON.stringify({ ultimo: true });
    const first = setData("k", big);   // comprime: tarda
    const second = setData("k", small); // plano: instantáneo
    await Promise.all([first, second]);
    expect(await decodeFromStorage(localStorage.getItem("k"))).toBe(small);
  });

  it("si localStorage no tiene espacio, setData falla (para que el guardado reintente) y los siguientes siguen andando", async () => {
    const original = Storage.prototype.setItem;
    let calls = 0;
    Storage.prototype.setItem = function (...args) {
      calls += 1;
      if (calls === 1) throw new Error("QuotaExceededError");
      return original.apply(this, args);
    };
    try {
      await expect(setData("k", "uno")).rejects.toThrow();
      await setData("k", "dos");
      expect(localStorage.getItem("k")).toBe("dos");
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it("getData de una clave inexistente devuelve null", async () => {
    expect(await getData("no-existe")).toBeNull();
  });
});
