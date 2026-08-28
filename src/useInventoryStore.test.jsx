import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useInventoryStore } from "./useInventoryStore";

// El hook persiste en localStorage real (via storage.js) -- se limpia entre
// tests para que no arrastren estado de una corrida a otra.
beforeEach(() => {
  localStorage.clear();
});

async function renderLoadedStore() {
  const view = renderHook(() => useInventoryStore());
  await waitFor(() => expect(view.result.current.loaded).toBe(true));
  return view;
}

describe("useInventoryStore -- recordatorio de respaldo", () => {
  it("no pide respaldo si todavía no hay movimientos", async () => {
    const { result } = await renderLoadedStore();
    expect(result.current.backupReminderDue).toBe(false);
  });

  it("pide respaldo si hay movimientos y nunca se exportó nada", async () => {
    const { result } = await renderLoadedStore();
    act(() => {
      result.current.registerManualSale(result.current.products[0].code, 1);
    });
    await waitFor(() => expect(result.current.movements.length).toBeGreaterThan(0));
    expect(result.current.backupReminderDue).toBe(true);
    expect(result.current.lastBackupAt).toBeNull();
  });

  it("markBackupDone apaga el recordatorio y guarda la fecha", async () => {
    const { result } = await renderLoadedStore();
    act(() => {
      result.current.registerManualSale(result.current.products[0].code, 1);
    });
    await waitFor(() => expect(result.current.backupReminderDue).toBe(true));

    act(() => {
      result.current.markBackupDone();
    });

    await waitFor(() => expect(result.current.backupReminderDue).toBe(false));
    expect(result.current.lastBackupAt).not.toBeNull();
  });
});

describe("useInventoryStore -- ajuste global de mostrar negocio", () => {
  it("arranca activado por default", async () => {
    const { result } = await renderLoadedStore();
    expect(result.current.sendBusinessName).toBe(true);
  });

  it("setSendBusinessNameSetting cambia y persiste el valor", async () => {
    const { result } = await renderLoadedStore();
    act(() => {
      result.current.setSendBusinessNameSetting(false);
    });
    await waitFor(() => expect(result.current.sendBusinessName).toBe(false));

    const persisted = JSON.parse(localStorage.getItem("procovar-inventario-v1"));
    expect(persisted.sendBusinessName).toBe(false);
  });
});
