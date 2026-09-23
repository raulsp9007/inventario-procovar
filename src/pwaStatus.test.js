import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// El módulo real importa "virtual:pwa-register" (solo existe con el plugin
// de Vite corriendo) -- se sustituye por un doble simple para poder probar
// la lógica de estado sin depender de eso. Se captura el callback
// onNeedRefresh para poder dispararlo a mano desde los tests.
let capturedOptions = null;
vi.mock("virtual:pwa-register", () => ({
  registerSW: (options) => {
    capturedOptions = options;
    return () => {};
  },
}));

async function freshModule() {
  vi.resetModules();
  capturedOptions = null;
  return await import("./pwaStatus");
}

describe("pwaStatus", () => {
  let originalOnLine;

  beforeEach(() => {
    originalOnLine = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
    Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
  });

  afterEach(() => {
    if (originalOnLine) Object.defineProperty(window.navigator, "onLine", originalOnLine);
  });

  it("arranca 'al día' si el navegador dice que hay conexión", async () => {
    const { getPwaStatus, initPwaStatus } = await freshModule();
    initPwaStatus();
    const s = getPwaStatus();
    expect(s.offline).toBe(false);
    expect(s.updateAvailable).toBe(false);
    expect(s.lastOnlineAt).not.toBeNull();
  });

  it("arranca sin conexión si el navegador ya estaba offline", async () => {
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    const { getPwaStatus, initPwaStatus } = await freshModule();
    initPwaStatus();
    expect(getPwaStatus().offline).toBe(true);
    expect(getPwaStatus().lastOnlineAt).toBeNull();
  });

  it("los eventos online/offline del navegador actualizan el estado y avisan a los suscriptores", async () => {
    const { getPwaStatus, initPwaStatus, subscribePwaStatus } = await freshModule();
    initPwaStatus();
    const seen = [];
    subscribePwaStatus((s) => seen.push(s.offline));

    window.dispatchEvent(new Event("offline"));
    expect(getPwaStatus().offline).toBe(true);
    window.dispatchEvent(new Event("online"));
    expect(getPwaStatus().offline).toBe(false);
    expect(seen).toEqual([true, false]);
  });

  it("onNeedRefresh marca que hay una actualización esperando", async () => {
    const { getPwaStatus, initPwaStatus } = await freshModule();
    initPwaStatus();
    expect(capturedOptions).not.toBeNull();
    capturedOptions.onNeedRefresh();
    expect(getPwaStatus().updateAvailable).toBe(true);
  });

  it("initPwaStatus solo se registra una vez, sin importar cuántas veces se llame", async () => {
    const { initPwaStatus } = await freshModule();
    initPwaStatus();
    const firstOptions = capturedOptions;
    initPwaStatus();
    expect(capturedOptions).toBe(firstOptions);
  });

  it("subscribePwaStatus devuelve una función para dejar de escuchar", async () => {
    const { initPwaStatus, subscribePwaStatus } = await freshModule();
    initPwaStatus();
    const seen = [];
    const unsubscribe = subscribePwaStatus((s) => seen.push(s.offline));
    unsubscribe();
    window.dispatchEvent(new Event("offline"));
    expect(seen).toEqual([]);
  });
});
