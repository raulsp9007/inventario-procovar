import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { CloudError } from "./cloudApi";
import { makeLinkCode } from "./linkCode";
import { loadCloud } from "./cloudStorage";
import { useCloudSync } from "./useCloudSync";
import { siteNow, hasSiteClock, clearSiteClock } from "./siteClock";

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
    statusSince: vi.fn(async () => ({ now: state.now, orders: state.rows, ...(state.site || {}) })),
    time: vi.fn(async () => state.timeReply || { now: new Date().toISOString(), zona: "America/Havana", ajuste: 0, hoy: "2026-10-30", hora: "11:00" }),
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

beforeEach(() => { localStorage.clear(); clearSiteClock(); });

describe("useCloudSync: envío en lote", () => {
  const sent = (id) => order({ orderId: id, customerName: `Cliente ${id}` });

  it("varios pedidos enviados juntos suben en una sola petición, cada uno con cuándo se hizo el cambio", async () => {
    const ctx = setup({ orders: [sent("o1"), sent("o2"), sent("o3")] });
    ctx.api.putOrders = vi.fn(async (ops) => ({ resultados: ops.map((o) => ({ id: o.orderId, ok: true })) }));
    await act(async () => { await ctx.hook.result.current.linkWith(CODE); });
    await waitFor(() => expect(ctx.api.putOrders).toHaveBeenCalledTimes(1));
    const ops = ctx.api.putOrders.mock.calls[0][0];
    expect(ops.map((o) => o.orderId).sort()).toEqual(["o1", "o2", "o3"]);
    expect(ops.every((o) => typeof o.queuedAt === "string" && o.content.customerName)).toBe(true);
    expect(ctx.api.putOrder).not.toHaveBeenCalled();
    await waitFor(() => expect(ctx.hook.result.current.pendingCount).toBe(0));
    expect(ctx.hook.result.current.chips.o2).toEqual({ state: "cloud", text: "En nube" });
  });

  it("si el lote falla por la conexión, se reintenta solo y llegan todos", async () => {
    const ctx = setup({ orders: [sent("o1"), sent("o2")], retryDelaysMs: [30, 30] });
    ctx.api.putOrders = vi.fn()
      .mockRejectedValueOnce(new CloudError("network", 0, "x"))
      .mockImplementation(async (ops) => ({ resultados: ops.map((o) => ({ id: o.orderId, ok: true })) }));
    await act(async () => { await ctx.hook.result.current.linkWith(CODE); });
    await waitFor(() => expect(ctx.api.putOrders).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(ctx.hook.result.current.pendingCount).toBe(0));
  });

  it("un pedido que la nube rechaza dentro del lote sale en rojo y los otros quedan en la nube", async () => {
    const ctx = setup({ orders: [sent("o1"), sent("o2")] });
    ctx.api.putOrders = vi.fn(async (ops) => ({ resultados: ops.map((o) => (o.orderId === "o2" ? { id: "o2", ok: false, status: 409, error: "La facturación de hoy cerró." } : { id: o.orderId, ok: true })) }));
    await act(async () => { await ctx.hook.result.current.linkWith(CODE); });
    await waitFor(() => expect(ctx.hook.result.current.chips.o2).toEqual({ state: "rejected", text: "La facturación de hoy cerró." }));
    expect(ctx.hook.result.current.chips.o1).toEqual({ state: "cloud", text: "En nube" });
  });
});

// Mientras haya pedidos enviados que la facturadora no confirmó (o cosas en cola), con la app a la vista se consulta cada
// pocos minutos, en vez de cada hora: el vendedor se entera antes de lo confirmado o de un problema.
describe("useCloudSync: vigilancia mientras hay pedidos sin confirmar", () => {
  const setVisibility = (state) => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state }); };
  afterEach(() => { delete document.visibilityState; });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  it("con un pedido enviado sin confirmar consulta cada tanto", async () => {
    const ctx = setup({ watchMs: 30 });
    await linked(ctx);
    await waitFor(() => expect(ctx.api.statusSince.mock.calls.length).toBeGreaterThan(1));
  });

  it("sin pedidos pendientes no consulta (solo cada hora)", async () => {
    const ctx = setup({ watchMs: 30, orders: [] });
    await act(async () => { await ctx.hook.result.current.linkWith(CODE); });
    await wait(150);
    expect(ctx.api.statusSince).not.toHaveBeenCalled();
  });

  it("cuando ya está todo confirmado deja de consultar", async () => {
    const ctx = setup({ watchMs: 30 });
    ctx.state.rows = [{ id: "o1", status: "confirmado", rev: 1, modified: false, confirmedAt: "2026-10-30T15:10:00.000Z", confirmedBy: "facturadora", updatedAt: "x" }];
    await linked(ctx);
    await waitFor(() => expect(ctx.api.statusSince).toHaveBeenCalled());
    await wait(60);
    const calls = ctx.api.statusSince.mock.calls.length;
    await wait(150);
    expect(ctx.api.statusSince.mock.calls.length).toBe(calls);
  });

  it("con la app oculta no consulta", async () => {
    const ctx = setup({ watchMs: 30 });
    await linked(ctx);
    setVisibility("hidden");
    await wait(60);
    const calls = ctx.api.statusSince.mock.calls.length;
    await wait(150);
    expect(ctx.api.statusSince.mock.calls.length).toBe(calls);
  });

  it("por defecto es cada 5 minutos (no hace nada de más en las pruebas ni al abrir)", async () => {
    const ctx = setup();
    await linked(ctx);
    await wait(100);
    expect(ctx.api.statusSince).not.toHaveBeenCalled();
  });
});

// La hora del sitio: la app la aprende del buzón (al abrir y en cada comprobación) y la usa para el día y las horas.
describe("useCloudSync: hora del sitio", () => {
  it("al abrir la app enlazada pregunta la hora del sitio (una consulta liviana, no la lista de pedidos)", async () => {
    const ctx = setup();
    ctx.state.timeReply = { now: new Date().toISOString(), zona: "America/Havana", ajuste: 120, hoy: "2026-10-30", hora: "11:00" };
    await linked(ctx);
    await waitFor(() => expect(ctx.api.time).toHaveBeenCalled());
    await waitFor(() => expect(hasSiteClock()).toBe(true));
    expect(ctx.api.statusSince).not.toHaveBeenCalled();
  });

  it("al comprobar aprende la hora del sitio de la respuesta", async () => {
    const ctx = setup();
    await linked(ctx);
    clearSiteClock();
    ctx.state.site = { zona: "America/Havana", ajuste: 90 };
    ctx.state.now = new Date().toISOString();
    await act(async () => { await ctx.hook.result.current.syncNow(); });
    expect(hasSiteClock()).toBe(true);
    // la hora del sitio va 90 minutos delante de la de Cuba en ese momento
    const havana = new Intl.DateTimeFormat("en-US", { timeZone: "America/Havana", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    const wall = Number(havana.find((p) => p.type === "hour").value) * 60 + Number(havana.find((p) => p.type === "minute").value) + 90;
    const now = siteNow();
    expect((now.getHours() * 60 + now.getMinutes() - wall + 1440) % 1440).toBeLessThanOrEqual(2);
  });

  it("si el buzón no contesta la hora, la app sigue con la del teléfono", async () => {
    const ctx = setup();
    ctx.api.time.mockRejectedValue(new CloudError("network", 0, "x"));
    await linked(ctx);
    await waitFor(() => expect(ctx.api.time).toHaveBeenCalled());
    expect(hasSiteClock()).toBe(false);
  });

  it("al desenlazar vuelve a la hora del teléfono", async () => {
    const ctx = setup();
    await linked(ctx);
    await waitFor(() => expect(hasSiteClock()).toBe(true));
    act(() => { ctx.hook.result.current.unlink(); });
    expect(hasSiteClock()).toBe(false);
  });

  it("una API vieja sin esa consulta no rompe nada", async () => {
    const ctx = setup();
    delete ctx.api.time;
    await linked(ctx);
    expect(ctx.hook.result.current.link).toBeTruthy();
  });
});

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
    }, { queuedAt: expect.any(String) });
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
    await waitFor(() => expect(loading.api.putOrder).toHaveBeenCalledWith("o1", expect.any(Object), expect.any(Object)));
    await act(async () => { await loading.hook.result.current.syncNow(); });
    expect(loading.api.statusSince).toHaveBeenCalled();
    expect(loading.api.putOrder.mock.invocationCallOrder[0]).toBeLessThan(loading.api.statusSince.mock.invocationCallOrder[0]);
  });
});

// La app comprueba sola lo que confirmó la facturadora cada hora (intervalMs, 1 h
// por defecto) con la app abierta, y al volver a ella si ya pasó más de una hora.
// El botón "Comprobar" (syncNow) sigue ahí para hacerlo al momento.
describe("useCloudSync: fuera del horario de facturación", () => {
  const closed = () => new CloudError("closed", 423, "La facturación está cerrada. Abre hoy a las 9:00 a. m.");

  it("el pedido queda en cola, con el motivo, y no se pierde", async () => {
    const ctx = setup();
    ctx.api.putOrder.mockRejectedValue(closed());
    await act(async () => { await ctx.hook.result.current.linkWith(CODE); });
    await waitFor(() => expect(ctx.hook.result.current.phase).toBe("closed"));
    expect(ctx.hook.result.current.message).toBe("La facturación está cerrada. Abre hoy a las 9:00 a. m.");
    expect(ctx.hook.result.current.pendingCount).toBe(1);
    expect(ctx.hook.result.current.chips.o1).toEqual({ state: "queued", text: "En cola: facturación cerrada" });
    expect(ctx.hook.result.current.rejected).toEqual([]);
  });

  it("cuando abre, al volver a intentar se envía y sale de la cola", async () => {
    const ctx = setup();
    ctx.api.putOrder.mockRejectedValueOnce(closed());
    await act(async () => { await ctx.hook.result.current.linkWith(CODE); });
    await waitFor(() => expect(ctx.hook.result.current.pendingCount).toBe(1));
    await act(async () => { await ctx.hook.result.current.syncNow(); });
    expect(ctx.api.putOrder).toHaveBeenCalledTimes(2);
    expect(ctx.hook.result.current.pendingCount).toBe(0);
    expect(ctx.hook.result.current.phase).toBe("ok");
    expect(ctx.hook.result.current.chips.o1).toEqual({ state: "cloud", text: "En nube" });
  });

  it("al comprobar, el buzón dice si la facturación está cerrada", async () => {
    const ctx = setup();
    await linked(ctx);
    ctx.api.statusSince.mockResolvedValueOnce({ now: ctx.state.now, orders: [], horario: { activo: true, abierto: false, mensaje: "La facturación está cerrada. Abre mañana sábado a las 9:00 a. m.", abre: "09:00", cierra: "15:00" } });
    await act(async () => { await ctx.hook.result.current.syncNow(); });
    expect(ctx.hook.result.current.closedMessage).toBe("La facturación está cerrada. Abre mañana sábado a las 9:00 a. m.");
    ctx.api.statusSince.mockResolvedValueOnce({ now: ctx.state.now, orders: [], horario: { activo: true, abierto: true, mensaje: "", abre: "09:00", cierra: "15:00" } });
    await act(async () => { await ctx.hook.result.current.syncNow(); });
    expect(ctx.hook.result.current.closedMessage).toBe("");
  });
});

describe("useCloudSync: pedido rechazado por la nube", () => {
  const rejection = () => new CloudError("invalid", 400, "Falta el nombre del cliente.");

  it("el pedido queda marcado como rechazado, con el motivo, y no se reenvía igual", async () => {
    const ctx = setup();
    ctx.api.putOrder.mockRejectedValue(rejection());
    await linked(ctx);
    await waitFor(() => expect(ctx.hook.result.current.chips.o1).toEqual({ state: "rejected", text: "Falta el nombre del cliente." }));
    expect(ctx.hook.result.current.pendingCount).toBe(0);
    expect(ctx.hook.result.current.rejected).toHaveLength(1);
    await act(async () => { await ctx.hook.result.current.syncNow(); });
    expect(ctx.api.putOrder).toHaveBeenCalledTimes(1);
    expect(ctx.hook.result.current.chips.o1.state).toBe("rejected");
  });

  it("al corregir el pedido se manda de nuevo y, si la nube lo acepta, el aviso desaparece", async () => {
    const ctx = setup();
    ctx.api.putOrder.mockRejectedValueOnce(rejection());
    await linked(ctx);
    await waitFor(() => expect(ctx.hook.result.current.chips.o1.state).toBe("rejected"));
    ctx.hook.rerender({ ...ctx.props, orders: [order({ lines: [{ code: "P500", qty: 41, unitPrice: 120 }] })] });
    await waitFor(() => expect(ctx.api.putOrder).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(ctx.hook.result.current.chips.o1).toEqual({ state: "cloud", text: "En nube" }));
  });
});

describe("useCloudSync: comprobación automática cada hora", () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  it("por defecto el intervalo es de una hora", async () => {
    const timers = vi.spyOn(globalThis, "setInterval");
    const cloud = fakeCloud();
    const { intervalMs: _ignored, ...rest } = { orders: [order()], products, setOrdersConfirmed: vi.fn(), createApi: cloud.createApi, debounceMs: 0, today: "2026-10-30" };
    const hook = renderHook((props) => useCloudSync(props), { initialProps: rest });
    await act(async () => { await hook.result.current.linkWith(CODE); });
    expect(timers.mock.calls.some(([, ms]) => ms === 3600000)).toBe(true);
    timers.mockRestore();
  });

  it("al enlazar no consulta enseguida, ni al volver la conexión", async () => {
    const ctx = setup();
    await linked(ctx);
    act(() => { window.dispatchEvent(new Event("online")); document.dispatchEvent(new Event("visibilitychange")); });
    await wait(50);
    expect(ctx.api.statusSince).not.toHaveBeenCalled();
  });

  // Si el buzón no responde (mala señal, fallo del servidor) la cola se reintenta sola en pocos
  // segundos, sin esperar a la comprobación de cada hora.
  describe("reintento automático de la cola", () => {
    const offline = () => new CloudError("network", 0, "No se pudo conectar con la nube.");
    const fast = { retryDelaysMs: [30, 30, 30] };

    it("tras un fallo de red lo reintenta solo y el pedido llega", async () => {
      const ctx = setup(fast);
      ctx.api.putOrder.mockRejectedValueOnce(offline());
      await linked(ctx);
      await waitFor(() => expect(ctx.api.putOrder).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(ctx.hook.result.current.pendingCount).toBe(0));
      expect(ctx.hook.result.current.chips.o1).toEqual({ state: "cloud", text: "En nube" });
      expect(ctx.api.statusSince).not.toHaveBeenCalled();
    });

    it("también tras un fallo del servidor", async () => {
      const ctx = setup(fast);
      ctx.api.putOrder.mockRejectedValueOnce(new CloudError("server", 500, "x"));
      await linked(ctx);
      await waitFor(() => expect(ctx.api.putOrder).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(ctx.hook.result.current.pendingCount).toBe(0));
    });

    it("sigue intentando mientras no haya conexión, y para cuando llega", async () => {
      const ctx = setup(fast);
      ctx.api.putOrder.mockRejectedValueOnce(offline()).mockRejectedValueOnce(offline());
      await linked(ctx);
      await waitFor(() => expect(ctx.api.putOrder).toHaveBeenCalledTimes(3));
      await waitFor(() => expect(ctx.hook.result.current.pendingCount).toBe(0));
      await wait(150);
      expect(ctx.api.putOrder).toHaveBeenCalledTimes(3);
    });

    it("conserva cuándo se hizo el cambio aunque se reintente más tarde", async () => {
      const ctx = setup(fast);
      ctx.api.putOrder.mockRejectedValueOnce(offline());
      await linked(ctx);
      await waitFor(() => expect(ctx.api.putOrder).toHaveBeenCalledTimes(2));
      const [first, second] = ctx.api.putOrder.mock.calls;
      expect(second[2].queuedAt).toBe(first[2].queuedAt);
    });

    it("si la nube rechaza el pedido (datos no válidos) no lo reintenta", async () => {
      const ctx = setup(fast);
      ctx.api.putOrder.mockRejectedValue(new CloudError("invalid", 400, "Falta el nombre del cliente."));
      await linked(ctx);
      await wait(150);
      expect(ctx.api.putOrder).toHaveBeenCalledTimes(1);
    });

    it("si el código ya no sirve no insiste", async () => {
      const ctx = setup(fast);
      ctx.api.putOrder.mockRejectedValue(new CloudError("auth", 401, "x"));
      await linked(ctx);
      await wait(150);
      expect(ctx.api.putOrder).toHaveBeenCalledTimes(1);
    });

    it("al desenlazar deja de reintentar", async () => {
      const ctx = setup(fast);
      ctx.api.putOrder.mockRejectedValue(offline());
      await linked(ctx);
      act(() => { ctx.hook.result.current.unlink(); });
      const calls = ctx.api.putOrder.mock.calls.length;
      await wait(150);
      expect(ctx.api.putOrder.mock.calls.length).toBe(calls);
    });
  });

  // Sin internet los pedidos quedan en cola; al volver la conexión se reenvían solos
  // (solo se sube lo pendiente: no se consulta lo que confirmó la facturadora).
  describe("al volver la conexión", () => {
    const offline = () => new CloudError("network", 0, "No se pudo conectar con la nube.");

    it("reenvía lo que quedó en cola, sin consultar la nube", async () => {
      const ctx = setup();
      ctx.api.putOrder.mockRejectedValueOnce(offline());
      await linked(ctx);
      await waitFor(() => expect(ctx.hook.result.current.pendingCount).toBe(1));
      expect(ctx.api.putOrder).toHaveBeenCalledTimes(1);
      act(() => { window.dispatchEvent(new Event("online")); });
      await waitFor(() => expect(ctx.api.putOrder).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(ctx.hook.result.current.pendingCount).toBe(0));
      expect(ctx.hook.result.current.phase).toBe("ok");
      expect(ctx.api.statusSince).not.toHaveBeenCalled();
    });

    it("si todavía no hay conexión, sigue en cola y lo dice", async () => {
      const ctx = setup();
      ctx.api.putOrder.mockRejectedValue(offline());
      await linked(ctx);
      await waitFor(() => expect(ctx.hook.result.current.pendingCount).toBe(1));
      act(() => { window.dispatchEvent(new Event("online")); });
      await waitFor(() => expect(ctx.api.putOrder).toHaveBeenCalledTimes(2));
      expect(ctx.hook.result.current.pendingCount).toBe(1);
      expect(ctx.hook.result.current.phase).toBe("offline");
    });

    it("sin nada en cola no hace nada", async () => {
      const ctx = setup();
      await linked(ctx);
      await waitFor(() => expect(ctx.hook.result.current.pendingCount).toBe(0));
      const before = ctx.createApi.mock.calls.length;
      act(() => { window.dispatchEvent(new Event("online")); });
      await wait(60);
      expect(ctx.createApi.mock.calls.length).toBe(before);
      expect(ctx.api.putOrder).toHaveBeenCalledTimes(1);
    });

    it("con la nube apagada no reenvía", async () => {
      const ctx = setup();
      ctx.api.putOrder.mockRejectedValueOnce(offline());
      await linked(ctx);
      await waitFor(() => expect(ctx.hook.result.current.pendingCount).toBe(1));
      act(() => ctx.hook.result.current.setEnabled(false));
      act(() => { window.dispatchEvent(new Event("online")); });
      await wait(80);
      expect(ctx.api.putOrder).toHaveBeenCalledTimes(1);
    });

    it("al desmontar deja de escuchar", async () => {
      const ctx = setup();
      ctx.api.putOrder.mockRejectedValueOnce(offline());
      await linked(ctx);
      await waitFor(() => expect(ctx.hook.result.current.pendingCount).toBe(1));
      ctx.hook.unmount();
      act(() => { window.dispatchEvent(new Event("online")); });
      await wait(60);
      expect(ctx.api.putOrder).toHaveBeenCalledTimes(1);
    });
  });

  it("cuando se cumple el intervalo consulta sola y marca lo confirmado", async () => {
    const ctx = setup({ intervalMs: 60 });
    ctx.state.rows = [{ id: "o1", status: "confirmado", rev: 1, modified: false, confirmedAt: new Date(2026, 9, 30, 10, 42).toISOString(), confirmedBy: "facturadora", updatedAt: "2026-10-30T15:42:00.000Z" }];
    await linked(ctx);
    await waitFor(() => expect(ctx.api.statusSince).toHaveBeenCalled());
    await waitFor(() => expect(ctx.setOrdersConfirmed).toHaveBeenCalledWith(["o1"], true));
    expect(ctx.hook.result.current.lastCheck).toBeTruthy();
  });

  it("la comprobación automática no enciende 'Comprobando…'", async () => {
    const ctx = setup({ intervalMs: 3600000 });
    await linked(ctx);
    let release;
    ctx.api.statusSince.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve({ now: ctx.state.now, orders: [] }); }));
    ctx.hook.rerender({ ...ctx.props, intervalMs: 40 });
    await waitFor(() => expect(ctx.api.statusSince).toHaveBeenCalled());
    expect(ctx.hook.result.current.checking).toBe(false);
    await act(async () => { release(); });
  });

  it("con la nube apagada no comprueba sola", async () => {
    const ctx = setup({ intervalMs: 3600000 });
    await linked(ctx);
    act(() => ctx.hook.result.current.setEnabled(false));
    ctx.hook.rerender({ ...ctx.props, intervalMs: 40 });
    await wait(150);
    expect(ctx.api.statusSince).not.toHaveBeenCalled();
  });

  it("sin enlace no comprueba sola", async () => {
    const ctx = setup({ intervalMs: 40 });
    await wait(150);
    expect(ctx.createApi).not.toHaveBeenCalled();
  });

  it("al volver a la app después de más de una hora, comprueba", async () => {
    const ctx = setup({ intervalMs: 3600000 });
    await linked(ctx);
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 3600000 + 1000);
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    await waitFor(() => expect(ctx.api.statusSince).toHaveBeenCalledTimes(1));
    clock.mockRestore();
  });

  it("al volver a la app antes de la hora, no comprueba", async () => {
    const ctx = setup({ intervalMs: 3600000 });
    await linked(ctx);
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 30 * 60000);
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    await wait(60);
    expect(ctx.api.statusSince).not.toHaveBeenCalled();
    clock.mockRestore();
  });

  it("tras comprobar con el botón, la hora se cuenta desde ahí", async () => {
    const ctx = setup({ intervalMs: 3600000 });
    await linked(ctx);
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 50 * 60000);
    await act(async () => { await ctx.hook.result.current.syncNow(); });
    expect(ctx.api.statusSince).toHaveBeenCalledTimes(1);
    clock.mockReturnValue(now + 80 * 60000);
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    await wait(60);
    expect(ctx.api.statusSince).toHaveBeenCalledTimes(1);
    clock.mockRestore();
  });

  it("los cambios en los pedidos siguen subiéndose solos, sin consultar", async () => {
    const ctx = setup({ orders: [] });
    await act(async () => { await ctx.hook.result.current.linkWith(CODE); });
    ctx.hook.rerender({ ...ctx.props, orders: [order({ orderId: "o9" })] });
    await waitFor(() => expect(ctx.api.putOrder).toHaveBeenCalledWith("o9", expect.any(Object), expect.any(Object)));
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
    expect(ctx.api.putOrder).toHaveBeenCalledWith("o1", expect.objectContaining({ customerCode: "AB1001", businessName: "Kiosco Sol" }), expect.any(Object));
  });
});

describe("useCloudSync: subir", () => {
  it("un pedido nuevo enviado a facturación se sube solo", async () => {
    const ctx = setup({ orders: [] });
    await act(async () => { await ctx.hook.result.current.linkWith(CODE); });
    expect(ctx.api.putOrder).not.toHaveBeenCalled();
    ctx.hook.rerender({ ...ctx.props, orders: [order({ orderId: "o7" })] });
    await waitFor(() => expect(ctx.api.putOrder).toHaveBeenCalledWith("o7", expect.any(Object), expect.any(Object)));
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
