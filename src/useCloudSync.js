import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createCloudApi, CloudError } from "./cloudApi";
import { parseLinkCode } from "./linkCode";
import { loadCloud, saveCloud, clearCloud } from "./cloudStorage";
import { reconcile, applyStatuses, mergeOps, flushQueue, chipFor, markRejected } from "./cloudSync";
import { todayStr } from "./dateUtils";

// Sincronización del vendedor con la nube de facturación. Orquesta las piezas
// puras de cloudSync.js: sube lo enviado a facturación, vacía la cola cuando hay
// conexión y consulta lo que confirmó la facturadora para marcarlo en la app (CONF.):
// al pulsar "Comprobar" (syncNow), y solo cada hora (intervalMs) mientras la app está
// abierta o al volver a ella si ya pasó más de una hora. No consulta al enlazar; al volver
// la conexión solo reenvía lo que quedó en cola (sin consultar lo confirmado). Todo se guarda aparte del estado de la app (cloudStorage.js).

// Se suben los pedidos de hoy y los de días que vienen (los de mañana ya quedan en la nube, listos para
// que la facturadora los vea ese día); los de días que ya pasaron no.

const MESSAGES = {
  network: "Sin conexión. Se enviará al volver.",
  auth: "El código de enlace ya no sirve. Vuelve a enlazar.",
  server: "La nube tuvo un problema. Se reintentará.",
};

// Cuánto se espera la respuesta del buzón al revisar el cierre antes de enviar un pedido.
const CIERRE_CHECK_MS = 2500;

// `ready`: la app ya cargó sus datos. Mientras no, la lista de pedidos está vacía
// y sincronizar sería consultar la nube sin nada que subir.
// Si el buzón no responde (mala señal, fallo del servidor), la cola de pedidos se reintenta sola cada
// pocos segundos (cada vez más espaciado) en vez de esperar a la comprobación de cada hora.
const RETRY_DELAYS_MS = [10000, 30000, 60000, 120000];

export function useCloudSync({
  orders, products, customers = [], setOrdersConfirmed, createApi = createCloudApi, debounceMs = 400, today, ready = true, intervalMs = 3600000, retryDelaysMs = RETRY_DELAYS_MS,
}) {
  const [cloud, setCloud] = useState(() => loadCloud());
  const [status, setStatus] = useState({ phase: "idle", message: "", lastSyncAt: null, rejected: [], lastCheck: null });
  const [checking, setChecking] = useState(false);
  const cloudRef = useRef(cloud);
  const propsRef = useRef({});
  propsRef.current = { orders, products, customers, setOrdersConfirmed, createApi, today, ready, retryDelaysMs };
  const busyRef = useRef(false);
  // Cuándo se consultó por última vez la nube (para contar la hora de la comprobación automática).
  const lastPullRef = useRef(Date.now());
  const rerunRef = useRef(null);
  const retryRef = useRef(null);
  const attemptRef = useRef(0);
  const syncRef = useRef(null);

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
    // Cada subida lleva anotado cuándo se hizo el cambio: si se demora en la cola, el buzón cuenta el
    // cierre del día en ese momento y no cuando por fin llega.
    const queuedAt = new Date().toISOString();
    const queue = mergeOps(current.queue, planned.ops.map((op) => (op.kind === "put" ? { ...op, queuedAt } : op)));
    commit({ map: planned.nextMap, queue });

    let stopped = null;
    let stoppedMessage = "";
    let rejected = [];
    if (queue.length > 0) {
      const out = await flushQueue({ queue, api });
      // Lo que la nube rechazó se marca en el pedido (aviso rojo) con el motivo.
      commit({ queue: out.remaining, map: markRejected(cloudRef.current.map, out.rejected) });
      stopped = out.stopped;
      stoppedMessage = out.stoppedMessage || "";
      rejected = out.rejected;
    }

    let pulled = false;
    let lastCheck = null;
    let horario;
    let cierre;
    if (!stopped && pull) {
      try {
        const data = await api.statusSince(cloudRef.current.since);
        horario = data.horario || null;
        cierre = data.cierre ? { ...data.cierre, zona: data.zona, ajuste: data.ajuste } : null;
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

    // Sin respuesta del buzón y con pedidos esperando: se vuelve a intentar solo, cada vez más espaciado.
    clearTimeout(retryRef.current);
    if ((stopped === "network" || stopped === "server") && cloudRef.current.queue.length > 0) {
      const delays = propsRef.current.retryDelaysMs;
      const delay = delays[Math.min(attemptRef.current, delays.length - 1)];
      attemptRef.current += 1;
      retryRef.current = setTimeout(() => { syncRef.current({ pull: false }); }, delay);
    } else {
      attemptRef.current = 0;
    }

    setStatus((prev) => ({
      phase: stopped ? (stopped === "network" ? "offline" : stopped === "auth" ? "auth" : stopped === "closed" ? "closed" : "error") : "ok",
      message: stopped ? (stopped === "closed" ? stoppedMessage : MESSAGES[stopped] || MESSAGES.server) : "",
      horario: horario === undefined ? prev.horario : horario,
      cierre: cierre === undefined ? prev.cierre : cierre,
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

  syncRef.current = sync;
  // Al cerrar la app (o desenlazar) no queda ningún reintento pendiente.
  useEffect(() => () => clearTimeout(retryRef.current), []);

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
    // Volvió la conexión: si quedó algo en cola (pedidos sin enviar), se reenvía ya.
    const onOnline = () => {
      if (cloudRef.current.queue.length > 0) sync({ pull: false });
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
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
    clearTimeout(retryRef.current);
    attemptRef.current = 0;
    clearCloud();
    cloudRef.current = loadCloud();
    setCloud(cloudRef.current);
    setStatus({ phase: "idle", message: "", lastSyncAt: null, rejected: [], lastCheck: null });
  }, []);

  const setEnabled = useCallback((enabled) => commit({ enabled }), [commit]);

  // Cierre de facturación del día, al momento: se pregunta al buzón justo antes de enviar un pedido de
  // hoy (no al abrir la app). Sin conexión, o si el buzón tarda, vale lo último que se supo.
  const statusRef = useRef(status);
  statusRef.current = status;
  const checkCierre = useCallback(async () => {
    const current = cloudRef.current;
    const lastKnown = statusRef.current.cierre || null;
    if (!current.link || !current.enabled) return lastKnown;
    try {
      const api = propsRef.current.createApi({ url: current.link.url, token: current.link.token });
      const timeout = new Promise((resolve) => { setTimeout(() => resolve(null), CIERRE_CHECK_MS); });
      const data = await Promise.race([api.statusSince(new Date().toISOString()), timeout]);
      if (!data) return lastKnown;
      const cierre = data.cierre ? { ...data.cierre, zona: data.zona, ajuste: data.ajuste } : null;
      setStatus((prev) => ({ ...prev, cierre }));
      // Recién preguntado al buzón: su "cerrado" vale más que la cuenta con el reloj del teléfono.
      return cierre ? { ...cierre, fresco: true } : null;
    } catch {
      return lastKnown;
    }
  }, []);
  // "Comprobar": sube lo pendiente y consulta lo que confirmó la facturadora.
  const syncNow = useCallback(async () => {
    setChecking(true);
    try {
      await sync({ pull: true });
    } finally {
      setChecking(false);
    }
  }, [sync]);

  // Fuera del horario de facturación lo que está en cola espera a que abra.
  const closed = status.phase === "closed";
  const chips = useMemo(() => {
    const queued = new Set(cloud.queue.map((op) => op.orderId));
    const out = {};
    Object.keys(cloud.map).forEach((id) => {
      let chip = chipFor({ entry: cloud.map[id], queued: queued.has(id) });
      if (chip && chip.state === "queued" && closed) chip = { state: "queued", text: "En cola: facturación cerrada" };
      if (chip) out[id] = chip;
    });
    return out;
  }, [cloud.map, cloud.queue, closed]);
  const closedMessage = closed ? status.message : (status.horario && status.horario.abierto === false ? status.horario.mensaje : "");

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
    closedMessage,
    // Cierre de facturación del día ({ activo, hora, ... }), o null si todavía no se sabe.
    cierre: status.cierre || null,
    checkCierre,
    linkWith,
    unlink,
    setEnabled,
    syncNow,
  };
}
