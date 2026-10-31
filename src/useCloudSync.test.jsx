import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { CloudError } from "./cloudApi";
import { makeLinkCode } from "./linkCode";
import { loadCloud } from "./cloudStorage";
import { useCloudSync } from "./useCloudSync";

// Hook del vendedor: sube los pedidos enviados a facturación, consulta lo que
// confirmó la facturadora y marca CONF. en la app. El buzón se simula con un
// doble de la API (createApi).

const URL_OK = "https://buzon.test";
const TOKEN = "k3J9xQ2mVb7LpR4tYw8NaZ5cHd1FgUe6";
const CODE = makeLinkCode({ url: URL_OK, token: TOKEN });
const FACT_CODE = makeLinkCode({ url: URL_OK, token: "f".repeat(24) });
const products = [{ code: "P500", name: "Parranda 500ml", short: "P-500" }];

const order = (over = {}) => ({
  orderId: "o1", date: "2026-10-30", customerName: "Ana López", isDelivery: false, sent: true, confirmed: false,
  lines: [{ code: "P500", qty: 40, unitPrice: 120 }], ...over,
});

function fakeCloud() {
  const state = { rows: [], now: "2026-10-30T15:00:00.000Z", role: "vendedor" };
  const api = {
    me: vi.fn(async () => ({ id: "carlos", name: "Carlos Pérez", role: state.role })),
    putOrder: vi.fn(async () => ({})),
    deleteOrder: vi.fn(async () => ({})),
    confirmOrder: vi.fn(async () => ({})),
    statusSince: vi.fn(async () => ({ now: state.now, orders: state.rows })),
  };
  return { api, state, createApi: vi.fn(() => api) };
}

function setup(over = {}) {
  const cloud = fakeCloud();
  const setOrdersConfirmed = vi.fn();
  const initial = { orders: [order()], products, setOrdersConfirmed, createApi: cloud.createApi, debounceMs: 0, intervalMs: 999999, today: "2026-10-30", ...over };
  const hook = renderHook((props) => useCloudSync(props), { initialProps: initial });
  return { ...cloud, setOrdersConfirmed, hook, props: initial };
}

const linked = async (ctx) => {
  await act(async () => { await ctx.hook.result.current.linkWith(CODE); });
  await waitFor(() => expect(ctx.api.putOrder).toHaveBeenCalled());
};

beforeEach(() => localStorage.clear());

describe("useCloudSync: enlazar", () => {
  it("sin enlace no hace nada", async () => {
    const ctx = setup();
    await act(async () => { await ctx.hook.result.current.syncNow(); });
    expect(ctx.createApi).not.toHaveBeenCalled();
    expect(ctx.hook.result.current.link).toBeNull();
    expect(ctx.hook.result.current.chips).toEqual({});
  });

  it("con un código válido de vendedor queda enlazado y sube lo enviado a facturación", async () => {
    const ctx = setup();
    await linked(ctx);
    expect(ctx.hook.result.current.link).toMatchObject({ url: URL_OK, name: "Carlos Pérez", role: "vendedor" });
    expect(ctx.api.putOrder).toHaveBeenCalledWith("o1", {
      customerName: "Ana López", date: "2026-10-30", total: 4800,
      lines: [{ code: "P500", name: "Parranda 500ml", qty: 40, unitPrice: 120 }],
    });
    await waitFor(() => expect(ctx.hook.result.current.chips.o1).toEqual({ state: "cloud", text: "En nube" }));
    expect(loadCloud().link.name).toBe("Carlos Pérez");
  });

  it("el código de la facturadora no sirve en la app del vendedor", async () => {
    const ctx = setup();
    ctx.state.role = "facturadora";
    await expect(act(async () => { await ctx.hook.result.current.linkWith(FACT_CODE); })).rejects.toThrow("Este código es de la facturadora. Úsalo en su app.");
    expect(ctx.hook.result.current.link).toBeNull();
    expect(loadCloud().link).toBeNull();
  });

  it("un código mal escrito avisa y no enlaza", async () => {
    const ctx = setup();
    await expect(act(async () => { await ctx.hook.result.current.linkWith("hola"); })).rejects.toThrow("Ese no es un código de enlace de Procovar.");
    expect(ctx.createApi).not.toHaveBeenCalled();
  });

  it("si el buzón rechaza el código, lo dice", async () => {
    const ctx = setup();
    ctx.api.me.mockRejectedValue(new CloudError("auth", 401, "El código de enlace ya no sirve."));
    await expect(act(async () => { await ctx.hook.result.current.linkWith(CODE); })).rejects.toThrow("El código de enlace ya no sirve.");
    expect(ctx.hook.result.current.link).toBeNull();
  });

  it("desenlazar borra todo", async () => {
    const ctx = setup();
    await linked(ctx);
    act(() => ctx.hook.result.current.unlink());
    expect(ctx.hook.result.current.link).toBeNull();
    expect(ctx.hook.result.current.chips).toEqual({});
    expect(loadCloud().link).toBeNull();
    expect(loadCloud().map).toEqual({});
  });

  it("recuerda el enlace al volver a abrir la app", async () => {
    const ctx = setup();
    await linked(ctx);
    ctx.hook.unmount();
    const again = setup();
    expect(again.hook.result.current.link).toMatchObject({ name: "Carlos Pérez" });
    expect(again.hook.result.current.chips.o1).toEqual({ state: "cloud", text: "En nube" });
  });
});

describe("useCloudSync: esperar a que la app cargue", () => {
  it("no sube ni consulta mientras la app no está lista (los pedidos aún no cargaron)", async () => {
    const ctx = setup({ orders: [], ready: false });
    localStorage.setItem("procovar-nube-enlace", JSON.stringify({ url: URL_OK, token: TOKEN, name: "Carlos Pérez", role: "vendedor" }));
    ctx.hook.unmount();
    const loading = setup({ orders: [], ready: false });
    await act(async () => { await loading.hook.result.current.syncNow(); });
    await new Promise((r) => setTimeout(r, 30));
    expect(loading.api.statusSince).not.toHaveBeenCalled();
    expect(loading.api.putOrder).not.toHaveBeenCalled();

    loading.hook.rerender({ ...loading.props, orders: [order()], ready: true });
    await waitFor(() => expect(loading.api.putOrder).toHaveBeenCalledWith("o1", expect.any(Object)));
    await act(async () => { await loading.hook.result.current.syncNow(); });
    expect(loading.api.statusSince).toHaveBeenCalled();
    expect(loading.api.putOrder.mock.invocationCallOrder[0]).toBeLessThan(loading.api.statusSince.mock.invocationCallOrder[0]);
  });
});

// El vendedor decide cuándo mirar: la app no consulta sola lo que confirmó la
// facturadora, solo cuando se pulsa "Comprobar" (syncNow).
describe("useCloudSync: solo comprueba cuando se pide", () => {
  it("ni al enlazar, ni cada rato, ni al volver a la app, ni al volver la conexión", async () => {
    const ctx = setup({ intervalMs: 10 });
    await linked(ctx);
    await new Promise((r) => setTimeout(r, 120));
    act(() => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("online")); });
    await new Promise((r) => setTimeout(r, 50));
    expect(ctx.api.statusSince).not.toHaveBeenCalled();
  });

  it("los cambios en los pedidos siguen subiéndose solos, sin consultar", async () => {
    const ctx = setup({ orders: [] });
    await act(async () => { await ctx.hook.result.current.linkWith(CODE); });
    ctx.hook.rerender({ ...ctx.props, orders: [order({ orderId: "o9" })] });
    await waitFor(() => expect(ctx.api.putOrder).toHaveBeenCalledWith("o9", expect.any(Object)));
    expect(ctx.api.statusSince).not.toHaveBeenCalled();
  });

  it("al comprobar, dice cuántos pedidos confirmó la facturadora", async () => {
    const ctx = setup();
    await linked(ctx);
    expect(ctx.hook.result.current.lastCheck).toBeNull();
    ctx.state.rows = [{ id: "o1", status: "confirmado", rev: 1, modified: false, confirmedAt: new Date(2026, 9, 30, 10, 42).toISOString(), confirmedBy: "facturadora", updatedAt: "2026-10-30T15:42:00.000Z" }];
    await act(async () => { await ctx.hook.result.current.syncNow(); });
    expect(ctx.hook.result.current.lastCheck).toMatchObject({ confirmed: 1, unconfirmed: 0 });
    expect(ctx.hook.result.current.lastCheck.at).toBeTruthy();
  });

  it("sin novedades dice cero, y 'checking' sube mientras consulta", async () => {
    const ctx = setup();
    await linked(ctx);
    let release;
    ctx.api.statusSince.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve({ now: ctx.state.now, orders: [] }); }));
    let pending;
    act(() => { pending = ctx.hook.result.current.syncNow(); });
    await waitFor(() => expect(ctx.hook.result.current.checking).toBe(true));
    await act(async () => { release(); await pending; });
    expect(ctx.hook.result.current.checking).toBe(false);
    expect(ctx.hook.result.current.lastCheck).toMatchObject({ confirmed: 0, unconfirmed: 0 });
  });

  it("sin conexión no registra una comprobación hecha", async () => {
    const ctx = setup();
    await linked(ctx);
    ctx.api.statusSince.mockRejectedValue(new CloudError("network", 0, "x"));
    await act(async () => { await ctx.hook.result.current.syncNow(); });
    expect(ctx.hook.result.current.lastCheck).toBeNull();
    expect(ctx.hook.result.current.phase).toBe("offline");
  });
});

describe("useCloudSync: datos del cliente", () => {
  it("sube el código y el negocio del cliente junto con el pedido", async () => {
    const customers = [{ id: "c1", name: "Ana López", businessName: "Kiosco Sol", phone: "", code: "AB1001" }];
    const ctx = setup({ customers });
    await linked(ctx);
    expect(ctx.api.putOrder).toHaveBeenCalledWith("o1", expect.objectContaining({ customerCode: "AB1001", businessName: "Kiosco Sol" }));
  });
});

describe("useCloudSync: subir", () => {
  it("un pedido nuevo enviado a facturación se sube solo", async () => {
    const ctx = setup({ orders: [] });
    await act(async () => { await ctx.hook.result.current.linkWith(CODE); });
    expect(ctx.api.putOrder).not.toHaveBeenCalled();
    ctx.hook.rerender({ ...ctx.props, orders: [order({ orderId: "o7" })] });
    await waitFor(() => expect(ctx.api.putOrder).toHaveBeenCalledWith("o7", expect.any(Object)));
  });

  it("no sube pedidos viejos al enlazar", async () => {
    const ctx = setup({ orders: [order({ orderId: "viejo", date: "2026-09-01" }), order()] });
    await linked(ctx);
    expect(ctx.api.putOrder.mock.calls.map((c) => c[0])).toEqual(["o1"]);
  });

  it("sin internet queda en cola y se sube al volver", async () => {
    const ctx = setup();
    ctx.api.putOrder.mockRejectedValue(new CloudError("network", 0, "x"));
    await act(async () => { await ctx.hook.result.current.linkWith(CODE); });
    await waitFor(() => expect(ctx.hook.result.current.chips.o1).toEqual({ state: "queued", text: "En cola" }));
    expect(ctx.hook.result.current.pendingCount).toBe(1);
    expect(ctx.hook.result.current.phase).toBe("offline");
    expect(loadCloud().queue).toHaveLength(1);

    ctx.api.putOrder.mockResolvedValue({});
    await act(async () => { await ctx.hook.result.current.syncNow(); });
    expect(ctx.hook.result.current.chips.o1).toEqual({ state: "cloud", text: "En nube" });
    expect(ctx.hook.result.current.pendingCount).toBe(0);
    expect(ctx.hook.result.current.phase).toBe("ok");
  });

  it("si el código dejó de servir, avisa para volver a enlazar", async () => {
    const ctx = setup();
    await linked(ctx);
    ctx.api.statusSince.mockRejectedValue(new CloudError("auth", 401, "x"));
    await act(async () => { await ctx.hook.result.current.syncNow(); });
    expect(ctx.hook.result.current.phase).toBe("auth");
    expect(ctx.hook.result.current.message).toMatch(/enlazar/i);
  });

  it("apagado, no sube ni consulta", async () => {
    const ctx = setup();
    await linked(ctx);
    act(() => ctx.hook.result.current.setEnabled(false));
    ctx.api.putOrder.mockClear();
    ctx.api.statusSince.mockClear();
    ctx.hook.rerender({ ...ctx.props, orders: [order(), order({ orderId: "o2" })] });
    await act(async () => { await ctx.hook.result.current.syncNow(); });
    expect(ctx.api.putOrder).not.toHaveBeenCalled();
    expect(ctx.api.statusSince).not.toHaveBeenCalled();
    expect(loadCloud().enabled).toBe(false);
  });
});

describe("useCloudSync: lo que confirma la facturadora", () => {
  const confirmedRow = (over = {}) => ({
    id: "o1", status: "confirmado", rev: 1, modified: false, confirmedAt: new Date(2026, 9, 30, 10, 42).toISOString(), confirmedBy: "facturadora", updatedAt: "2026-10-30T15:42:00.000Z", ...over,
  });

  it("su 👍 marca CONF. en el pedido y se ve quién lo confirmó", async () => {
    const ctx = setup();
    await linked(ctx);
    ctx.state.rows = [confirmedRow()];
    ctx.state.now = "2026-10-30T15:50:00.000Z";
    await act(async () => { await ctx.hook.result.current.syncNow(); });
    expect(ctx.setOrdersConfirmed).toHaveBeenCalledWith(["o1"], true);
    expect(ctx.hook.result.current.chips.o1).toEqual({ state: "confirmed", text: "Confirmado por facturación a las 10:42" });
    expect(ctx.hook.result.current.lastSyncAt).toBeTruthy();
  });

  it("consulta solo lo nuevo desde la última vez", async () => {
    const ctx = setup();
    await linked(ctx);
    await act(async () => { await ctx.hook.result.current.syncNow(); });
    ctx.state.now = "2026-10-30T16:00:00.000Z";
    await act(async () => { await ctx.hook.result.current.syncNow(); });
    await act(async () => { await ctx.hook.result.current.syncNow(); });
    expect(ctx.api.statusSince).toHaveBeenLastCalledWith("2026-10-30T16:00:00.000Z");
  });

  it("si ella lo deshace, se quita el CONF. que puso la app", async () => {
    const ctx = setup();
    await linked(ctx);
    ctx.state.rows = [confirmedRow()];
    await act(async () => { await ctx.hook.result.current.syncNow(); });
    ctx.hook.rerender({ ...ctx.props, orders: [order({ confirmed: true })] });
    ctx.state.rows = [confirmedRow({ status: "pendiente", confirmedAt: null, confirmedBy: null })];
    await act(async () => { await ctx.hook.result.current.syncNow(); });
    expect(ctx.setOrdersConfirmed).toHaveBeenLastCalledWith(["o1"], false);
    expect(ctx.hook.result.current.chips.o1).toEqual({ state: "cloud", text: "En nube" });
  });

  it("si el vendedor confirma a mano, también lo confirma en la nube", async () => {
    const ctx = setup();
    await linked(ctx);
    ctx.hook.rerender({ ...ctx.props, orders: [order({ confirmed: true })] });
    await waitFor(() => expect(ctx.api.confirmOrder).toHaveBeenCalledWith("o1"));
  });
});
