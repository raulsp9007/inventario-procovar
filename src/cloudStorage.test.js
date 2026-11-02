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

// La app del vendedor y la página de la facturadora viven en el mismo sitio (mismo
// navegador): cada una guarda lo suyo aparte, para que entrar a una no pise a la otra.
describe("cloudStorage: la facturadora y el vendedor no se pisan", () => {
  const vendorLink = { url: "https://b.test", token: "v".repeat(24), name: "Carlos", role: "vendedor" };
  const factLink = { url: "https://b.test", token: "s".repeat(24), name: "Tania", role: "facturadora" };

  it("la facturadora guarda en su propio lugar y el vendedor sigue enlazado", () => {
    saveCloud({ link: vendorLink, queue: [{ kind: "put", orderId: "o1" }] });
    saveCloud({ link: factLink, queue: [{ kind: "confirm", ids: ["a"] }], data: { sellers: [], at: 1 } }, "facturadora");
    expect(loadCloud().link).toEqual(vendorLink);
    expect(loadCloud().queue).toEqual([{ kind: "put", orderId: "o1" }]);
    expect(loadCloud("facturadora").link).toEqual(factLink);
    expect(loadCloud("facturadora").queue).toEqual([{ kind: "confirm", ids: ["a"] }]);
  });

  it("salir de la sesión de la facturadora no desenlaza al vendedor, y al revés", () => {
    saveCloud({ link: vendorLink });
    saveCloud({ link: factLink }, "facturadora");
    clearCloud("facturadora");
    expect(loadCloud("facturadora").link).toBeNull();
    expect(loadCloud().link).toEqual(vendorLink);
    saveCloud({ link: factLink }, "facturadora");
    clearCloud();
    expect(loadCloud().link).toBeNull();
    expect(loadCloud("facturadora").link).toEqual(factLink);
  });

  it("la app del vendedor ignora un acceso que no es de vendedor (de antes, cuando compartían lugar)", () => {
    for (const role of ["facturadora", "supervisor", "admin"]) {
      localStorage.setItem(CLOUD_KEYS.link, JSON.stringify({ ...factLink, role }));
      expect(loadCloud().link).toBeNull();
    }
    localStorage.setItem(CLOUD_KEYS.link, JSON.stringify({ url: "https://b.test", token: "v".repeat(24), name: "Carlos" })); // sin rol: de una versión vieja
    expect(loadCloud().link).toMatchObject({ name: "Carlos" });
  });

  it("la facturadora que ya tenía su sesión en el lugar de antes la conserva (y se mueve)", () => {
    localStorage.setItem(CLOUD_KEYS.link, JSON.stringify(factLink));
    expect(loadCloud("facturadora").link).toEqual(factLink);
    expect(localStorage.getItem(CLOUD_KEYS.link)).toBeNull();
    expect(loadCloud("facturadora").link).toEqual(factLink);
  });

  it("la supervisión también", () => {
    const sup = { ...factLink, name: "Maria", role: "supervisor" };
    localStorage.setItem(CLOUD_KEYS.link, JSON.stringify(sup));
    expect(loadCloud("facturadora").link).toEqual(sup);
  });

  it("el enlace de un vendedor en el lugar de antes no pasa a la facturadora", () => {
    saveCloud({ link: vendorLink });
    expect(loadCloud("facturadora").link).toBeNull();
    expect(loadCloud().link).toEqual(vendorLink);
  });

  it("no usa los mismos nombres que el vendedor", () => {
    saveCloud({ link: factLink, since: "x" }, "facturadora");
    expect(localStorage.getItem(CLOUD_KEYS.link)).toBeNull();
    expect(Object.keys(localStorage).filter((k) => k.startsWith("procovar-fact-")).length).toBeGreaterThan(0);
  });
});
