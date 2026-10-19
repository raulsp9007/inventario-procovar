import { describe, it, expect, vi, afterEach } from "vitest";
import { portalSearchUrl, openPortalSearch, PORTAL_BASE, PORTAL_WINDOW_NAME, PORTAL_WINDOW_FEATURES } from "./portalLink";

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

// Ventana pequeña y reutilizable: siempre el mismo nombre (así un nuevo toque
// cambia la búsqueda en la misma ventana en vez de abrir otra) y con medidas de
// popup (480x820; en el celular las ignora y abre su pestaña personalizada).
describe("openPortalSearch", () => {
  afterEach(() => vi.restoreAllMocks());

  it("abre una ventana pequeña con nombre fijo", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    openPortalSearch("Ana López");
    expect(PORTAL_WINDOW_NAME).toBe("procovar-portal");
    expect(PORTAL_WINDOW_FEATURES).toBe("popup,width=480,height=820");
    expect(open).toHaveBeenCalledWith(
      "https://pedidos.procovar.cloud/panel/panel-pedidos?buscar=Ana%20L%C3%B3pez",
      "procovar-portal",
      "popup,width=480,height=820",
    );
  });

  it("suelta la referencia opener para que el portal no alcance la app", () => {
    const win = { opener: window };
    vi.spyOn(window, "open").mockImplementation(() => win);
    openPortalSearch("Ana");
    expect(win.opener).toBeNull();
  });

  it("si el navegador bloquea la ventana (devuelve null) no falla", () => {
    vi.spyOn(window, "open").mockImplementation(() => null);
    expect(() => openPortalSearch("Ana")).not.toThrow();
  });

  it("sin nombre no abre nada", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    openPortalSearch("  ");
    expect(open).not.toHaveBeenCalled();
  });
});
