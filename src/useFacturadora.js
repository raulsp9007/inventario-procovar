import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createCloudApi, CloudError } from "./cloudApi";
import { parseAccess } from "./linkCode";
import { CLOUD_URL } from "./cloudConfig";
import { loadCloud, saveCloud, clearCloud } from "./cloudStorage";
import { overlayOps, totalPending, mergeFactOps, onlyDay } from "./facturadoraData";
import { todayStr, addDaysStr } from "./dateUtils";

// Lógica de la app de la facturadora: lista los pedidos por vendedor, manda su 👍
// (y el deshacer) y, sin internet, guarda esas operaciones en cola y las muestra
// ya aplicadas. Lo último que vio queda guardado para verlo sin conexión.

// La página de la facturadora guarda su sesión aparte de la app del vendedor (ver cloudStorage.js).
const SCOPE = "facturadora";

const MESSAGES = {
  network: "Sin conexión. Se muestra lo último que se vio.",
  auth: "La sesión ya no sirve. Vuelve a entrar.",
  server: "La nube tuvo un problema. Se reintentará.",
};

// Solo cuentan los pedidos del día de trabajo, que dice el buzón con la hora del sitio: hoy, y pasada
// la hora de cierre del día (la pone el administrador) el siguiente día de trabajo; así a esa hora la
// lista se limpia y van apareciendo los pedidos de mañana. Lo guardado de otro día no se muestra.
// `today` (AAAA-MM-DD) se puede fijar para pruebas; sin él, el del buzón y, si no lo dice, el de hoy
// en este equipo.
export function useFacturadora({ createApi = createCloudApi, intervalMs = 30000, ready = true, today, cloudUrl = CLOUD_URL } = {}) {
  const [cloud, setCloud] = useState(() => loadCloud(SCOPE));
  const [sellersRaw, setSellersRaw] = useState(() => (loadCloud(SCOPE).data ? loadCloud(SCOPE).data.sellers : []));
  // El día de trabajo y el de hoy que dijo el buzón la última vez (también lo guardado, para verlo sin conexión).
  const [days, setDays] = useState(() => {
    const data = loadCloud(SCOPE).data;
    return data && data.dia ? { dia: data.dia, hoy: data.hoy || data.dia } : null;
  });
  const daysRef = useRef(days);
  daysRef.current = days;
  const [status, setStatus] = useState(() => {
    const data = loadCloud(SCOPE).data;
    return { phase: "idle", message: "", lastSyncAt: data ? data.at : null, horario: null };
  });
  const cloudRef = useRef(cloud);
  const createApiRef = useRef(createApi);
  createApiRef.current = createApi;
  const todayRef = useRef(today);
  todayRef.current = today;
  const busyRef = useRef(false);
  const rerunRef = useRef(false);

  const commit = useCallback((patch) => {
    cloudRef.current = { ...cloudRef.current, ...patch };
    setCloud(cloudRef.current);
    saveCloud(patch, SCOPE);
  }, []);

  const runRefresh = useCallback(async () => {
    const { link, queue } = cloudRef.current;
    const api = createApiRef.current({ url: link.url, token: link.token });
    let stopped = null;

    // 1) Mandar lo que esperaba en cola. Fuera del horario de facturación se deja todo en cola
    // (se vuelve a intentar al abrir); la lista igual se lee.
    const remaining = [...queue];
    let queueClosed = false;
    while (remaining.length > 0 && !stopped && !queueClosed) {
      const op = remaining[0];
      try {
        if (op.kind === "confirm") await api.confirmMany(op.ids);
        else await api.unconfirmMany(op.ids);
        remaining.shift();
      } catch (e) {
        const kind = e instanceof CloudError ? e.kind : "server";
        if (kind === "closed") queueClosed = true;
        else if (kind === "network" || kind === "auth" || kind === "server") stopped = kind;
        else remaining.shift();
      }
    }
    commit({ queue: remaining });

    // 2) Leer la lista.
    let fetched = false;
    if (!stopped) {
      try {
        const data = await api.listOrders(todayRef.current || (daysRef.current && daysRef.current.dia) || todayStr());
        const at = Date.now();
        setSellersRaw(data.sellers);
        const nextDays = data.dia ? { dia: data.dia, hoy: data.hoy || data.dia } : null;
        setDays(nextDays);
        commit({ data: { sellers: data.sellers, at, ...(nextDays || {}) } });
        setStatus({ phase: "ok", message: "", lastSyncAt: at, horario: data.horario || null });
        fetched = true;
      } catch (e) {
        stopped = e instanceof CloudError ? e.kind : "server";
      }
    }
    if (!fetched) {
      setStatus((prev) => ({
        phase: stopped === "network" ? "offline" : stopped === "auth" ? "auth" : "error",
        message: MESSAGES[stopped] || MESSAGES.server,
        lastSyncAt: prev.lastSyncAt,
        horario: prev.horario,
      }));
    }
  }, [commit]);

  const refresh = useCallback(async () => {
    if (!cloudRef.current.link) return;
    if (busyRef.current) {
      rerunRef.current = true;
      return;
    }
    busyRef.current = true;
    try {
      await runRefresh();
    } finally {
      busyRef.current = false;
    }
    if (rerunRef.current) {
      rerunRef.current = false;
      await refresh();
    }
  }, [runRefresh]);

  const linked = ready && !!cloud.link;

  useEffect(() => {
    if (!linked) return undefined;
    refresh();
    // Con la pestaña oculta (otra pestaña, ventana minimizada, de noche) no hay nadie mirando: no se consulta;
    // al volver a ella se consulta enseguida (onVisible).
    const intervalId = setInterval(() => { if (document.visibilityState !== "hidden") refresh(); }, intervalMs);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    const onOnline = () => { refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [linked, intervalMs, refresh]);

  const operate = useCallback(async (kind, ids) => {
    if (!ids || ids.length === 0) return;
    // La supervisión solo mira: no confirma ni deshace nada.
    if (cloudRef.current.link && cloudRef.current.link.role === "supervisor") return;
    commit({ queue: mergeFactOps(cloudRef.current.queue, { kind, ids }) });
    await refresh();
  }, [commit, refresh]);

  const confirm = useCallback((ids) => operate("confirm", ids), [operate]);
  const unconfirm = useCallback((ids) => operate("unconfirm", ids), [operate]);

  const linkWith = useCallback(async (code) => {
    const { url, token } = parseAccess(code, cloudUrl);
    let me;
    try {
      me = await createApiRef.current({ url, token }).me();
    } catch (e) {
      if (e instanceof CloudError && e.kind === "auth") throw new Error("La contraseña no es correcta.");
      throw e;
    }
    if (me.role !== "facturadora") throw new Error("Este código es de un vendedor. Úsalo en la app de ventas.");
    commit({ link: { url, token, name: me.name, role: me.role }, queue: [], data: null });
    setSellersRaw([]);
    setStatus({ phase: "idle", message: "", lastSyncAt: null });
  }, [commit, cloudUrl]);

  // Entrar con usuario y contraseña (cuenta de facturación o de supervisión). Sin
  // usuario, lo escrito se toma como el código de siempre (enlace o contraseña vieja).
  const signIn = useCallback(async ({ usuario = "", clave = "" } = {}) => {
    const user = String(usuario).trim();
    if (!user) return linkWith(clave);
    const session = await createApiRef.current({ url: cloudUrl, token: "" }).login(user, clave);
    if (session.role !== "facturadora" && session.role !== "supervisor") throw new Error("Esta cuenta no es de facturación ni de supervisión.");
    commit({ link: { url: cloudUrl, token: session.token, name: session.name, role: session.role }, queue: [], data: null });
    setSellersRaw([]);
    setStatus({ phase: "idle", message: "", lastSyncAt: null });
    return undefined;
  }, [commit, cloudUrl, linkWith]);

  // Resumen de ventas de un día (lo usa la supervisión).
  const loadSales = useCallback((fecha) => {
    const { link } = cloudRef.current;
    return createApiRef.current({ url: link.url, token: link.token }).sales(fecha);
  }, []);

  const unlink = useCallback(() => {
    clearCloud(SCOPE);
    cloudRef.current = loadCloud(SCOPE);
    setCloud(cloudRef.current);
    setSellersRaw([]);
    setDays(null);
    setStatus({ phase: "idle", message: "", lastSyncAt: null });
  }, []);

  // Solo los pedidos del día de trabajo (también lo guardado de otro día deja de verse).
  const day = today || (days && days.dia) || todayStr();
  // ¿Ya se pasó a otro día? (pasada la hora de cierre): mañana, o el próximo día de trabajo si mañana no se trabaja.
  const nextDay = !today && !!days && days.dia > days.hoy;
  const nextDayIsTomorrow = nextDay && days.dia === addDaysStr(days.hoy, 1);
  const sellers = useMemo(
    () => overlayOps(onlyDay(sellersRaw, day), cloud.queue, new Date().toISOString()),
    [sellersRaw, cloud.queue, day],
  );

  return {
    link: cloud.link,
    readOnly: !!cloud.link && cloud.link.role === "supervisor",
    sellers,
    totalPending: totalPending(sellers),
    day,
    nextDay,
    nextDayIsTomorrow,
    phase: status.phase,
    message: status.message,
    lastSyncAt: status.lastSyncAt,
    closedMessage: status.horario && status.horario.abierto === false ? status.horario.mensaje : "",
    loadSales,
    pendingOps: cloud.queue.length,
    confirm,
    unconfirm,
    refresh,
    linkWith,
    signIn,
    unlink,
  };
}
