import { describe, it, expect, beforeEach } from "vitest";
import { loadCloud, saveCloud, clearCloud, CLOUD_KEYS } from "./cloudStorage";

// Lo de la nube se guarda aparte del estado de la app: el código de enlace es un
// secreto y no debe viajar en los respaldos que se comparten por WhatsApp.

beforeEach(() => localStorage.clear());

describe("cloudStorage", () => {
  it("sin nada guardado, valores vacíos", () => {
    expect(loadCloud()).toEqual({ link: null, enabled: true, map: {}, queue: [], since: "", data: null });
  });

  it("guarda y lee cada dato", () => {
    const link = { url: "https://b.test", token: "t".repeat(24), name: "Carlos", role: "vendedor" };
    saveCloud({ link, enabled: false, map: { o1: { published: true } }, queue: [{ kind: "confirm", orderId: "o1" }], since: "2026-10-30T15:00:00.000Z", data: { sellers: [{ id: "carlos" }], at: 123 } });
    expect(loadCloud()).toEqual({
      link, enabled: false, map: { o1: { published: true } }, queue: [{ kind: "confirm", orderId: "o1" }], since: "2026-10-30T15:00:00.000Z",
      data: { sellers: [{ id: "carlos" }], at: 123 },
    });
  });

  it("guardar un dato no pisa los demás", () => {
    saveCloud({ since: "a" });
    saveCloud({ enabled: false });
    expect(loadCloud()).toMatchObject({ since: "a", enabled: false });
  });

  it("lo dañado o con otra forma se ignora", () => {
    localStorage.setItem(CLOUD_KEYS.link, "{no json");
    localStorage.setItem(CLOUD_KEYS.map, JSON.stringify([1, 2]));
    localStorage.setItem(CLOUD_KEYS.queue, JSON.stringify({ a: 1 }));
    localStorage.setItem(CLOUD_KEYS.data, JSON.stringify({ sellers: "no es lista" }));
    localStorage.setItem(CLOUD_KEYS.link, JSON.stringify({ url: "https://b.test" })); // sin token
    expect(loadCloud()).toMatchObject({ link: null, map: {}, queue: [], data: null });
  });

  it("desenlazar borra todo lo de la nube", () => {
    saveCloud({ link: { url: "https://b.test", token: "t".repeat(24), name: "C", role: "vendedor" }, map: { o1: {} }, queue: [{}], since: "x", enabled: false });
    clearCloud();
    expect(loadCloud()).toEqual({ link: null, enabled: true, map: {}, queue: [], since: "", data: null });
  });

  it("no usa el mismo almacén que el estado de la app", () => {
    saveCloud({ since: "x" });
    expect(localStorage.getItem("procovar-inventario-v1")).toBeNull();
    Object.values(CLOUD_KEYS).forEach((key) => expect(key.startsWith("procovar-nube-")).toBe(true));
  });

  it("sin localStorage disponible no rompe", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", { get() { throw new Error("bloqueado"); }, configurable: true });
    try {
      expect(loadCloud().link).toBeNull();
      expect(() => saveCloud({ since: "x" })).not.toThrow();
    } finally {
      Object.defineProperty(window, "localStorage", original);
    }
  });
});
