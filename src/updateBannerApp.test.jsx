import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

// De punta a punta: cuando el service worker avisa que hay una versión
// nueva, aparece la barra en la app; Actualizar la aplica y la × la oculta.

let capturedOptions = null;
const { updateSW } = vi.hoisted(() => ({ updateSW: vi.fn() }));
vi.mock("virtual:pwa-register", () => ({
  registerSW: (options) => {
    capturedOptions = options;
    return updateSW;
  },
}));

const STORAGE_KEY = "procovar-inventario-v1";

async function renderApp(view = "pedidos") {
  vi.resetModules();
  capturedOptions = null;
  localStorage.setItem("procovar-active-tab", view);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    movements: [], customers: [], orderSeqPerDay: true, lastBackupAt: new Date().toISOString(),
    stock: {}, prices: {}, pricesAreUsd: true, exchangeRate: 100, hlPerFormatMigrated: true, goalProductsMigrated: true,
  }));
  const { default: InventoryApp } = await import("./InventoryApp");
  const { initPwaStatus } = await import("./pwaStatus");
  initPwaStatus();
  render(<InventoryApp />);
  await screen.findByRole("button", { name: "Productos" });
}

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = () => {};
  updateSW.mockReset();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-21T09:00:00")); // lunes fijo
});

afterEach(() => {
  vi.useRealTimers();
});

describe("barra de versión nueva en la app", () => {
  it("no aparece mientras no haya versión nueva", async () => {
    await renderApp();
    expect(screen.queryByText("Hay una versión nueva")).toBeNull();
  });

  it("aparece cuando el service worker avisa", async () => {
    await renderApp();
    act(() => { capturedOptions.onNeedRefresh(); });
    expect(await screen.findByText("Hay una versión nueva")).toBeTruthy();
  });

  it("Actualizar aplica la versión nueva", async () => {
    await renderApp();
    act(() => { capturedOptions.onNeedRefresh(); });
    fireEvent.click(await screen.findByRole("button", { name: "Actualizar" }));
    expect(updateSW).toHaveBeenCalledWith(true);
  });

  it("la × la oculta y no vuelve por la misma versión", async () => {
    await renderApp();
    act(() => { capturedOptions.onNeedRefresh(); });
    fireEvent.click(await screen.findByRole("button", { name: "Después" }));
    expect(screen.queryByText("Hay una versión nueva")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Productos" }));
    expect(screen.queryByText("Hay una versión nueva")).toBeNull();
  });

  it("una versión más nueva vuelve a mostrar la barra después de descartarla", async () => {
    await renderApp();
    act(() => { capturedOptions.onNeedRefresh(); });
    fireEvent.click(await screen.findByRole("button", { name: "Después" }));
    act(() => { capturedOptions.onNeedRefresh(); });
    expect(await screen.findByText("Hay una versión nueva")).toBeTruthy();
  });

  it("en Configuración sigue el aviso y se puede actualizar ahí aunque se haya descartado la barra", async () => {
    await renderApp("config");
    act(() => { capturedOptions.onNeedRefresh(); });
    fireEvent.click(await screen.findByRole("button", { name: "Después" }));
    fireEvent.click(screen.getByRole("button", { name: "Actualizar ahora" }));
    expect(updateSW).toHaveBeenCalledWith(true);
  });
});
