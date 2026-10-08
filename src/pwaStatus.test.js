import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// El módulo real importa "virtual:pwa-register" (solo existe con el plugin
// de Vite corriendo) -- se sustituye por un doble simple para poder probar
// la lógica de estado sin depender de eso. Se captura el callback
// onNeedRefresh para poder dispararlo a mano desde los tests.
let capturedOptions = null;
const { updateSW } = vi.hoisted(() => ({ updateSW: vi.fn() }));
vi.mock("virtual:pwa-register", () => ({
  registerSW: (options) => {
    capturedOptions = options;
    return updateSW;
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

describe("pwaStatus -- actualización con aviso", () => {
  beforeEach(() => {
    updateSW.mockReset();
    vi.useFakeTimers();
    Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
  });

  function setVisibility(state) {
    Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  }

  it("applyUpdate aplica la versión nueva (updateSW con recarga)", async () => {
    const { initPwaStatus, applyUpdate } = await freshModule();
    initPwaStatus();
    applyUpdate();
    expect(updateSW).toHaveBeenCalledWith(true);
  });

  it("dismissUpdate oculta el aviso pero la actualización sigue pendiente", async () => {
    const { getPwaStatus, initPwaStatus, dismissUpdate } = await freshModule();
    initPwaStatus();
    capturedOptions.onNeedRefresh();
    expect(getPwaStatus().updateDismissed).toBe(false);
    dismissUpdate();
    expect(getPwaStatus().updateDismissed).toBe(true);
    expect(getPwaStatus().updateAvailable).toBe(true);
  });

  it("una versión todavía más nueva vuelve a mostrar el aviso descartado", async () => {
    const { getPwaStatus, initPwaStatus, dismissUpdate } = await freshModule();
    initPwaStatus();
    capturedOptions.onNeedRefresh();
    dismissUpdate();
    capturedOptions.onNeedRefresh();
    expect(getPwaStatus().updateDismissed).toBe(false);
  });

  it("revisa si hay versión nueva cada hora", async () => {
    const { initPwaStatus } = await freshModule();
    initPwaStatus();
    const registration = { update: vi.fn().mockResolvedValue(undefined) };
    capturedOptions.onRegisteredSW("sw.js", registration);
    vi.advanceTimersByTime(59 * 60 * 1000);
    expect(registration.update).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it("sin conexión no revisa", async () => {
    const { initPwaStatus } = await freshModule();
    initPwaStatus();
    const registration = { update: vi.fn().mockResolvedValue(undefined) };
    capturedOptions.onRegisteredSW("sw.js", registration);
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    vi.advanceTimersByTime(61 * 60 * 1000);
    setVisibility("visible");
    expect(registration.update).not.toHaveBeenCalled();
  });

  it("revisa al volver la app al primer plano, no al irse a segundo plano", async () => {
    const { initPwaStatus } = await freshModule();
    initPwaStatus();
    const registration = { update: vi.fn().mockResolvedValue(undefined) };
    capturedOptions.onRegisteredSW("sw.js", registration);
    setVisibility("hidden");
    expect(registration.update).not.toHaveBeenCalled();
    setVisibility("visible");
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it("no revisa más de una vez por minuto aunque entre y salga seguido", async () => {
    const { initPwaStatus } = await freshModule();
    initPwaStatus();
    const registration = { update: vi.fn().mockResolvedValue(undefined) };
    capturedOptions.onRegisteredSW("sw.js", registration);
    setVisibility("visible");
    setVisibility("visible");
    expect(registration.update).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(61 * 1000);
    setVisibility("visible");
    expect(registration.update).toHaveBeenCalledTimes(2);
  });

  it("si la revisión falla (red caída) no rompe nada", async () => {
    const { initPwaStatus } = await freshModule();
    initPwaStatus();
    const registration = { update: vi.fn().mockRejectedValue(new Error("network")) };
    capturedOptions.onRegisteredSW("sw.js", registration);
    expect(() => setVisibility("visible")).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);
  });

  it("sin registro del service worker no hace nada", async () => {
    const { initPwaStatus } = await freshModule();
    initPwaStatus();
    expect(() => capturedOptions.onRegisteredSW("sw.js", undefined)).not.toThrow();
    expect(() => setVisibility("visible")).not.toThrow();
  });
});
