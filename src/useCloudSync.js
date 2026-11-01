import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createCloudApi, CloudError } from "./cloudApi";
import { parseLinkCode } from "./linkCode";
import { loadCloud, saveCloud, clearCloud } from "./cloudStorage";
import { reconcile, applyStatuses, mergeOps, flushQueue, chipFor } from "./cloudSync";
import { todayStr } from "./dateUtils";

// Sincronización del vendedor con la nube de facturación. Orquesta las piezas
// puras de cloudSync.js: sube lo enviado a facturación, vacía la cola cuando hay
// conexión y consulta lo que confirmó la facturadora para marcarlo en la app (CONF.):
// al pulsar "Comprobar" (syncNow), y solo cada hora (intervalMs) mientras la app está
// abierta o al volver a ella si ya pasó más de una hora. No consulta al enlazar ni al
// volver la conexión. Todo se guarda aparte del estado de la app (cloudStorage.js).

// Solo se suben los pedidos de "Hoy" (los que ve la facturadora; a las 12 am se limpia).

const MESSAGES = {
  network: "Sin conexión. Se enviará al volver.",
  auth: "El código de enlace ya no sirve. Vuelve a enlazar.",
  server: "La nube tuvo un problema. Se reintentará.",
};

// `ready`: la app ya cargó sus datos. Mientras no, la lista de pedidos está vacía
// y sincronizar sería consultar la nube sin nada que subir.
export function useCloudSync({
  orders, products, customers = [], setOrdersConfirmed, createApi = createCloudApi, debounceMs = 400, today, ready = true, intervalMs = 3600000,
}) {
  const [cloud, setCloud] = useState(() => loadCloud());
  const [status, setStatus] = useState({ phase: "idle", message: "", lastSyncAt: null, rejected: [], lastCheck: null });
  const [checking, setChecking] = useState(false);
  const cloudRef = useRef(cloud);
  const propsRef = useRef({});
  propsRef.current = { orders, products, customers, setOrdersConfirmed, createApi, today, ready };
  const busyRef = useRef(false);
  // Cuándo se consultó por última vez la nube (para contar la hora de la comprobación automática).
  const lastPullRef = useRef(Date.now());
  const rerunRef = useRef(null);

  const commit = useCallback((patch) => {
    cloudRef.current = { ...cloudRef.current, ...patch };
    setCloud(cloudRef.current);
    saveCloud(patch);
  }, []);

  const runSync = useCallback(async (pull) => {
    const current = cloudRef.current;
    const { orders: latestOrders, products: latestProducts, customers: latestCustomers, createApi: makeApi } = propsRef.current;
    const api = makeApi({ url: current.link.url, token: current.link.token });
    const today = propsRef.current.today || todayStr();

    const planned = reconcile({ orders: latestOrders, products: latestProducts, customers: latestCustomers, map: current.map, today });
    const queue = mergeOps(current.queue, planned.ops);
    commit({ map: planned.nextMap, queue });

    let stopped = null;
    let rejected = [];
    if (queue.length > 0) {
      const out = await flushQueue({ queue, api });
      commit({ queue: out.remaining });
      stopped = out.stopped;
      rejected = out.rejected;
    }

    let pulled = false;
    let lastCheck = null;
    if (!stopped && pull) {
      try {
        const data = await api.statusSince(cloudRef.current.since);
        const { orders: ordersNow, setOrdersConfirmed: confirmOrders } = propsRef.current;
        const result = applyStatuses({ rows: data.orders, orders: ordersNow, map: cloudRef.current.map });
        if (result.toConfirm.length > 0) confirmOrders(result.toConfirm, true);
        if (result.toUnconfirm.length > 0) confirmOrders(result.toUnconfirm, false);
        commit({ map: result.nextMap, since: data.now });
        pulled = true;
        lastPullRef.current = Date.now();
        lastCheck = { at: Date.now(), confirmed: result.toConfirm.length, unconfirmed: result.toUnconfirm.length };
      } catch (e) {
        stopped = e instanceof CloudError ? e.kind : "server";
      }
    }

    setStatus((prev) => ({
      phase: stopped ? (stopped === "network" ? "offline" : stopped === "auth" ? "auth" : "error") : "ok",
      message: stopped ? MESSAGES[stopped] || MESSAGES.server : "",
      lastSyncAt: pulled ? Date.now() : prev.lastSyncAt,
      rejected: rejected.length > 0 ? rejected : prev.rejected,
      lastCheck: lastCheck || prev.lastCheck,
    }));
  }, [commit]);

  const sync = useCallback(async ({ pull = false } = {}) => {
    const current = cloudRef.current;
    if (!current.link || !current.enabled || !propsRef.current.ready) return;
    if (busyRef.current) {
      rerunRef.current = { pull: pull || !!(rerunRef.current && rerunRef.current.pull) };
      return;
    }
    busyRef.current = true;
    try {
      await runSync(pull);
    } finally {
      busyRef.current = false;
    }
    if (rerunRef.current) {
      const next = rerunRef.current;
      rerunRef.current = null;
      await sync(next);
    }
  }, [runSync]);

  const linked = ready && !!cloud.link && cloud.enabled;

  // Cambios en los pedidos: subir lo que corresponda (sin consultar la nube).
  useEffect(() => {
    if (!linked) return undefined;
    const timeoutId = setTimeout(() => { sync({ pull: false }); }, debounceMs);
    return () => clearTimeout(timeoutId);
  }, [orders, products, linked, debounceMs, sync]);

  // Comprobación automática: cada hora con la app abierta, y al volver a ella (el teléfono
  // pausa los temporizadores con la app en segundo plano) si ya pasó más de una hora.
  useEffect(() => {
    if (!linked) return undefined;
    lastPullRef.current = Date.now();
    const intervalId = setInterval(() => { sync({ pull: true }); }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastPullRef.current >= intervalMs) sync({ pull: true });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [linked, intervalMs, sync]);

  const linkWith = useCallback(async (code) => {
    const { url, token } = parseLinkCode(code);
    const me = await propsRef.current.createApi({ url, token }).me();
    if (me.role !== "vendedor") throw new Error("Este código es de la facturadora. Úsalo en su app.");
    commit({ link: { url, token, name: me.name, role: me.role }, enabled: true, map: {}, queue: [], since: "" });
    setStatus({ phase: "idle", message: "", lastSyncAt: null, rejected: [], lastCheck: null });
  }, [commit]);

  const unlink = useCallback(() => {
    clearCloud();
    cloudRef.current = loadCloud();
    setCloud(cloudRef.current);
    setStatus({ phase: "idle", message: "", lastSyncAt: null, rejected: [], lastCheck: null });
  }, []);

  const setEnabled = useCallback((enabled) => commit({ enabled }), [commit]);
  // "Comprobar": sube lo pendiente y consulta lo que confirmó la facturadora.
  const syncNow = useCallback(async () => {
    setChecking(true);
    try {
      await sync({ pull: true });
    } finally {
      setChecking(false);
    }
  }, [sync]);

  const chips = useMemo(() => {
    const queued = new Set(cloud.queue.map((op) => op.orderId));
    const out = {};
    Object.keys(cloud.map).forEach((id) => {
      const chip = chipFor({ entry: cloud.map[id], queued: queued.has(id) });
      if (chip) out[id] = chip;
    });
    return out;
  }, [cloud.map, cloud.queue]);

  return {
    link: cloud.link,
    enabled: cloud.enabled,
    phase: status.phase,
    message: status.message,
    lastSyncAt: status.lastSyncAt,
    lastCheck: status.lastCheck,
    checking,
    rejected: status.rejected,
    pendingCount: cloud.queue.length,
    chips,
    linkWith,
    unlink,
    setEnabled,
    syncNow,
  };
}
