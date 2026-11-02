import { describe, it, expect, vi, afterEach } from "vitest";
import { portalSearchUrl, openPortalSearch, PORTAL_BASE, PORTAL_WINDOW_NAME, PORTAL_WINDOW_FEATURES, PORTAL_WINDOW_FEATURES_WIDE } from "./portalLink";

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

  // La facturadora trabaja en una computadora: ventana emergente más ancha (el portal es
  // un sitio de escritorio), con el mismo nombre para reutilizarla.
  it("ventana emergente ancha: mismo nombre y medidas de computadora", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    openPortalSearch("AB1001", { wide: true });
    expect(PORTAL_WINDOW_FEATURES_WIDE).toBe("popup,width=1000,height=800");
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith("https://pedidos.procovar.cloud/panel/panel-pedidos?buscar=AB1001", "procovar-portal", "popup,width=1000,height=800");
  });

  it("la ancha también suelta el opener", () => {
    const win = { opener: window };
    vi.spyOn(window, "open").mockImplementation(() => win);
    openPortalSearch("AB1001", { wide: true });
    expect(win.opener).toBeNull();
  });

  // Una pestaña normal (sin medidas de
  // popup), siempre la misma, para ir cambiando de código sin apilar ventanas.
  it("como pestaña normal: mismo nombre y sin medidas de popup", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    openPortalSearch("AB1001", { popup: false });
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0]).toEqual(["https://pedidos.procovar.cloud/panel/panel-pedidos?buscar=AB1001", "procovar-portal"]);
  });

  it("también suelta el opener cuando se abre como pestaña", () => {
    const win = { opener: window };
    vi.spyOn(window, "open").mockImplementation(() => win);
    openPortalSearch("AB1001", { popup: false });
    expect(win.opener).toBeNull();
  });
});
