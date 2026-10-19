import { describe, it, expect } from "vitest";
import { portalSearchUrl, PORTAL_BASE } from "./portalLink";

// Dirección del portal de pedidos con la búsqueda ya hecha: la pantalla de
// Pedidos del portal lee el parámetro "buscar" y lo pone en su buscador.

describe("portalSearchUrl", () => {
  it("apunta a la pantalla de pedidos del portal con el cliente en 'buscar'", () => {
    expect(PORTAL_BASE).toBe("https://pedidos.procovar.cloud");
    expect(portalSearchUrl("Ana")).toBe("https://pedidos.procovar.cloud/panel/panel-pedidos?buscar=Ana");
  });

  it("codifica tildes, espacios y símbolos", () => {
    expect(portalSearchUrl("Ana López & Hijos")).toBe(
      "https://pedidos.procovar.cloud/panel/panel-pedidos?buscar=Ana%20L%C3%B3pez%20%26%20Hijos",
    );
  });

  it("recorta espacios sobrantes y colapsa los repetidos", () => {
    expect(portalSearchUrl("  Ana   López ")).toBe("https://pedidos.procovar.cloud/panel/panel-pedidos?buscar=Ana%20L%C3%B3pez");
  });

  it("sin nombre no hay dirección", () => {
    expect(portalSearchUrl("")).toBeNull();
    expect(portalSearchUrl("   ")).toBeNull();
    expect(portalSearchUrl(undefined)).toBeNull();
  });
});
