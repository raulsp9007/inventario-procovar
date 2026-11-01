import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { CloudError } from "./cloudApi";
import { makeLinkCode } from "./linkCode";
import { loadCloud } from "./cloudStorage";
import { useFacturadora } from "./useFacturadora";

// Hook de la app de la facturadora: lista los pedidos por vendedor, manda su 👍
// (y el deshacer) y, sin internet, los guarda en cola y los muestra ya
// confirmados. El buzón se simula con un doble de la API.

const URL_OK = "https://buzon.test";
const FACT_CODE = makeLinkCode({ url: URL_OK, token: "f".repeat(24) });
const SELLER_CODE = makeLinkCode({ url: URL_OK, token: "s".repeat(24) });

const order = (id, over = {}) => ({
  id, sellerId: "carlos", sellerName: "Carlos Pérez", date: "2026-10-30", customerName: `Cliente ${id}`, total: 100, lines: [],
  status: "pendiente", rev: 1, modified: false, confirmedAt: null, confirmedBy: null, createdAt: "x", updatedAt: "x", ...over,
});
const sellersData = () => [
  { id: "carlos", name: "Carlos Pérez", pending: 2, confirmed: 0, orders: [order("a"), order("b")] },
  { id: "marta", name: "Marta Díaz", pending: 0, confirmed: 0, orders: [] },
];

function fakeCloud() {
  const state = { role: "facturadora", sellers: sellersData() };
  const api = {
    me: vi.fn(async () => ({ id: "fact", name: "Facturadora", role: state.role })),
    listOrders: vi.fn(async () => ({ now: "2026-10-30T16:00:00.000Z", sellers: state.sellers })),
    confirmMany: vi.fn(async (ids) => ({ confirmed: ids, missing: [] })),
    unconfirmMany: vi.fn(async (ids) => ({ unconfirmed: ids, missing: [] })),
  };
  return { api, state, createApi: vi.fn(() => api) };
}

function setup(over = {}) {
  const cloud = fakeCloud();
  const hook = renderHook((props) => useFacturadora(props), { initialProps: { createApi: cloud.createApi, intervalMs: 999999, today: "2026-10-30", ...over } });
  return { ...cloud, hook };
}

const linked = async (ctx) => {
  await act(async () => { await ctx.hook.result.current.linkWith(FACT_CODE); });
  await waitFor(() => expect(ctx.hook.result.current.sellers.length).toBeGreaterThan(0));
};

beforeEach(() => localStorage.clear());

// Solo cuentan los pedidos de "Hoy": a las 12 am la lista se limpia.
describe("useFacturadora: solo los pedidos de hoy", () => {
  it("le pide al buzón únicamente desde hoy", async () => {
    const ctx = setup();
    await linked(ctx);
    expect(ctx.api.listOrders).toHaveBeenCalledWith("2026-10-30");
  });

  it("no muestra los pedidos de otros días, y los contadores solo cuentan los de hoy", async () => {
    const ctx = setup();
    ctx.state.sellers = [
      { id: "carlos", name: "Carlos Pérez", pending: 2, confirmed: 1, orders: [order("hoy"), order("ayer", { date: "2026-10-29" }), order("ayer-ok", { date: "2026-10-29", status: "confirmado", confirmedBy: "facturadora" })] },
    ];
    await linked(ctx);
    const carlos = ctx.hook.result.current.sellers[0];
    expect(carlos.orders.map((o) => o.id)).toEqual(["hoy"]);
    expect(carlos).toMatchObject({ pending: 1, confirmed: 0 });
    expect(ctx.hook.result.current.totalPending).toBe(1);
  });

  it("al pasar la medianoche, lo guardado de ayer deja de verse aunque no haya internet", async () => {
    const ctx = setup();
    await linked(ctx);
    expect(ctx.hook.result.current.sellers[0].orders).toHaveLength(2);
    ctx.hook.unmount();
    const nextDay = setup({ today: "2026-10-31" });
    expect(nextDay.hook.result.current.sellers.every((s) => s.orders.length === 0)).toBe(true);
    expect(nextDay.hook.result.current.totalPending).toBe(0);
  });
});

describe("useFacturadora: enlazar", () => {
  it("sin enlace no hace nada", async () => {
    const ctx = setup();
    await act(async () => { await ctx.hook.result.current.refresh(); });
    expect(ctx.createApi).not.toHaveBeenCalled();
    expect(ctx.hook.result.current.sellers).toEqual([]);
  });

  it("con el código de la facturadora queda enlazada y ve a los vendedores", async () => {
    const ctx = setup();
    await linked(ctx);
    expect(ctx.hook.result.current.link).toMatchObject({ name: "Facturadora", role: "facturadora" });
    expect(ctx.hook.result.current.sellers.map((s) => s.id)).toEqual(["carlos", "marta"]);
    expect(ctx.hook.result.current.totalPending).toBe(2);
    expect(ctx.hook.result.current.phase).toBe("ok");
  });

  it("con la contraseña (sin código de enlace) entra usando la dirección de la página", async () => {
    const ctx = setup({ cloudUrl: URL_OK });
    await act(async () => { await ctx.hook.result.current.linkWith("  frase de la facturadora 2026  "); });
    expect(ctx.createApi).toHaveBeenCalledWith({ url: URL_OK, token: "frase de la facturadora 2026" });
    expect(ctx.hook.result.current.link).toMatchObject({ url: URL_OK, token: "frase de la facturadora 2026", role: "facturadora" });
  });

  it("una contraseña equivocada lo dice con esas palabras", async () => {
    const ctx = setup({ cloudUrl: URL_OK });
    ctx.api.me.mockRejectedValueOnce(new CloudError("auth", 401, "El código de enlace ya no sirve."));
    await expect(act(async () => { await ctx.hook.result.current.linkWith("otra cosa"); })).rejects.toThrow("La contraseña no es correcta.");
    expect(ctx.hook.result.current.link).toBeNull();
  });

  it("el código de un vendedor no sirve acá", async () => {
    const ctx = setup();
    ctx.state.role = "vendedor";
    await expect(act(async () => { await ctx.hook.result.current.linkWith(SELLER_CODE); })).rejects.toThrow("Este código es de un vendedor. Úsalo en la app de ventas.");
    expect(ctx.hook.result.current.link).toBeNull();
  });

  it("desenlazar borra todo", async () => {
    const ctx = setup();
    await linked(ctx);
    act(() => ctx.hook.result.current.unlink());
    expect(ctx.hook.result.current.link).toBeNull();
    expect(ctx.hook.result.current.sellers).toEqual([]);
    expect(loadCloud().link).toBeNull();
  });
});

describe("useFacturadora: el 👍", () => {
  it("confirma, lo manda y vuelve a leer la lista", async () => {
    const ctx = setup();
    await linked(ctx);
    ctx.api.confirmMany.mockImplementation(async (ids) => {
      ctx.state.sellers = sellersData();
      ctx.state.sellers[0].orders[0] = order("a", { status: "confirmado", confirmedBy: "facturadora", confirmedAt: "2026-10-30T16:01:00.000Z" });
      ctx.state.sellers[0].pending = 1; ctx.state.sellers[0].confirmed = 1;
      return { confirmed: ids, missing: [] };
    });
    await act(async () => { await ctx.hook.result.current.confirm(["a"]); });
    expect(ctx.api.confirmMany).toHaveBeenCalledWith(["a"]);
    const carlos = ctx.hook.result.current.sellers[0];
    expect(carlos).toMatchObject({ pending: 1, confirmed: 1 });
    expect(ctx.hook.result.current.pendingOps).toBe(0);
  });

  it("se ve confirmado al instante, antes de que conteste la nube", async () => {
    const ctx = setup();
    await linked(ctx);
    let release;
    ctx.api.confirmMany.mockImplementation(() => new Promise((resolve) => { release = () => resolve({ confirmed: ["a"], missing: [] }); }));
    let pending;
    act(() => { pending = ctx.hook.result.current.confirm(["a"]); });
    await waitFor(() => expect(ctx.hook.result.current.sellers[0].pending).toBe(1));
    expect(ctx.hook.result.current.totalPending).toBe(1);
    await act(async () => { release(); await pending; });
  });

  it("sin internet queda en cola, se ve confirmado y sale al volver", async () => {
    const ctx = setup();
    await linked(ctx);
    ctx.api.confirmMany.mockRejectedValue(new CloudError("network", 0, "x"));
    ctx.api.listOrders.mockRejectedValue(new CloudError("network", 0, "x"));
    await act(async () => { await ctx.hook.result.current.confirm(["a", "b"]); });
    expect(ctx.hook.result.current.pendingOps).toBe(1);
    expect(ctx.hook.result.current.phase).toBe("offline");
    expect(ctx.hook.result.current.sellers[0]).toMatchObject({ pending: 0, confirmed: 2 });
    expect(loadCloud().queue).toEqual([{ kind: "confirm", ids: ["a", "b"] }]);

    ctx.api.confirmMany.mockImplementation(async (ids) => ({ confirmed: ids, missing: [] }));
    ctx.api.listOrders.mockImplementation(async () => ({ now: "x", sellers: sellersData() }));
    await act(async () => { await ctx.hook.result.current.refresh(); });
    expect(ctx.api.confirmMany).toHaveBeenLastCalledWith(["a", "b"]);
    expect(ctx.hook.result.current.pendingOps).toBe(0);
    expect(ctx.hook.result.current.phase).toBe("ok");
  });

  it("deshacer manda el unconfirm", async () => {
    const ctx = setup();
    await linked(ctx);
    await act(async () => { await ctx.hook.result.current.unconfirm(["a"]); });
    expect(ctx.api.unconfirmMany).toHaveBeenCalledWith(["a"]);
  });

  it("lo que la nube rechaza se descarta y no se atasca la cola", async () => {
    const ctx = setup();
    await linked(ctx);
    ctx.api.confirmMany.mockRejectedValue(new CloudError("invalid", 400, "Falta la lista de pedidos (ids)."));
    await act(async () => { await ctx.hook.result.current.confirm(["a"]); });
    expect(ctx.hook.result.current.pendingOps).toBe(0);
  });
});

describe("useFacturadora: sin conexión y código vencido", () => {
  it("al abrir sin internet muestra lo último que vio", async () => {
    const ctx = setup();
    await linked(ctx);
    ctx.hook.unmount();
    const offline = setup();
    offline.api.listOrders.mockRejectedValue(new CloudError("network", 0, "x"));
    expect(offline.hook.result.current.sellers.map((s) => s.id)).toEqual(["carlos", "marta"]);
    await act(async () => { await offline.hook.result.current.refresh(); });
    expect(offline.hook.result.current.phase).toBe("offline");
    expect(offline.hook.result.current.message).toMatch(/sin conexión/i);
    expect(offline.hook.result.current.sellers).toHaveLength(2);
  });

  it("si el código ya no sirve, avisa para volver a enlazar", async () => {
    const ctx = setup();
    await linked(ctx);
    ctx.api.listOrders.mockRejectedValue(new CloudError("auth", 401, "x"));
    await act(async () => { await ctx.hook.result.current.refresh(); });
    expect(ctx.hook.result.current.phase).toBe("auth");
    expect(ctx.hook.result.current.message).toMatch(/enlazar/i);
  });
});
