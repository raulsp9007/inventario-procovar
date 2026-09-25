import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Borrar caché y recargar mientras no hay internet no deja NADA que la app
// pueda servir (se borra el service worker y el precache) -- el navegador
// entonces cae a su propia caché HTTP, que puede tener una versión de
// index.html/JS más vieja que la que se estaba viendo. Por eso, sin
// conexión, el botón debe negarse a tocar nada.
//
// El estado "offline" que lee Settings (usePwaStatus, en pwaStatus.js) se
// congela en `navigator.onLine` al cargarse ESE módulo por primera vez --
// hay que fijar onLine ANTES de importar Settings (con un módulo nuevo cada
// vez, vía resetModules) para que cada test arranque con el estado que
// quiere probar, en vez del que haya quedado de un test anterior.

function baseProps(overrides = {}) {
  return {
    whatsappPhone: "", onWhatsappPhoneChange: () => {},
    whatsappContactName: "", onWhatsappContactNameChange: () => {},
    cierreVentasHour: null, onCierreVentasHourChange: () => {},
    senderName: "", sendSenderName: false, onSenderSettingsChange: () => {},
    theme: "light", onToggleTheme: () => {},
    showPrices: true, onToggleShowPrices: () => {},
    commissionPercent: 0, hlGoal: null, sendBusinessName: true,
    productFormats: [], products: [], onSaveProductFormat: () => {}, onDeleteProductFormat: () => {},
    ...overrides,
  };
}

function setOnline(value) {
  Object.defineProperty(window.navigator, "onLine", { value, configurable: true });
}

// Como en pwaStatus.test.js: el módulo fija su "offline" inicial leyendo
// navigator.onLine una sola vez al cargarse -- resetModules() + volver a
// importarlo es la única forma de que cada test arranque desde ahí. También
// hay que iniciarlo (initPwaStatus, lo que en la app real hace main.jsx) para
// que las pruebas que simulan "recuperar conexión" tengan el listener
// enganchado y no se queden con el estado congelado del montaje.
async function freshSettings() {
  vi.resetModules();
  const { default: Settings } = await import("./Settings");
  const { initPwaStatus } = await import("./pwaStatus");
  initPwaStatus();
  return Settings;
}

describe("Settings -- Borrar caché y recargar", () => {
  let originalOnLine;
  let getRegistrations, unregister, cachesKeys, cachesDelete, reload;

  beforeEach(() => {
    originalOnLine = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
    unregister = vi.fn().mockResolvedValue(true);
    getRegistrations = vi.fn().mockResolvedValue([{ unregister }]);
    Object.defineProperty(window.navigator, "serviceWorker", {
      value: { getRegistrations }, configurable: true,
    });
    cachesDelete = vi.fn().mockResolvedValue(true);
    cachesKeys = vi.fn().mockResolvedValue(["workbox-precache-v2"]);
    Object.defineProperty(window, "caches", { value: { keys: cachesKeys, delete: cachesDelete }, configurable: true });
    reload = vi.fn();
    const currentLocation = window.location;
    Object.defineProperty(window, "location", { value: { ...currentLocation, reload }, configurable: true });
  });

  afterEach(() => {
    if (originalOnLine) Object.defineProperty(window.navigator, "onLine", originalOnLine);
    vi.restoreAllMocks();
  });

  it("sin conexión: no toca el service worker, no borra caché, no recarga, y avisa", async () => {
    setOnline(false);
    const Settings = await freshSettings();
    render(<Settings {...baseProps()} />);
    fireEvent.click(screen.getByRole("button", { name: /Borrar caché y recargar/ }));

    await waitFor(() => expect(screen.getByText(/necesitas internet/i)).toBeTruthy());
    expect(getRegistrations).not.toHaveBeenCalled();
    expect(cachesDelete).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("con conexión: borra service worker y caché, y recarga", async () => {
    setOnline(true);
    const Settings = await freshSettings();
    render(<Settings {...baseProps()} />);
    fireEvent.click(screen.getByRole("button", { name: /Borrar caché y recargar/ }));

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(cachesDelete).toHaveBeenCalledWith("workbox-precache-v2");
    expect(screen.queryByText(/necesitas internet/i)).toBeNull();
  });

  it("el aviso de sin conexión desaparece si se reintenta ya con internet", async () => {
    setOnline(false);
    const Settings = await freshSettings();
    render(<Settings {...baseProps()} />);
    fireEvent.click(screen.getByRole("button", { name: /Borrar caché y recargar/ }));
    await waitFor(() => expect(screen.getByText(/necesitas internet/i)).toBeTruthy());

    setOnline(true);
    window.dispatchEvent(new Event("online"));
    await waitFor(() => expect(screen.getByText("App actualizada")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Borrar caché y recargar/ }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/necesitas internet/i)).toBeNull();
  });
});
