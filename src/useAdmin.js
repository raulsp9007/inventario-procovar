import { useCallback, useEffect, useRef, useState } from "react";
import { createCloudApi, CloudError } from "./cloudApi";
import { CLOUD_URL } from "./cloudConfig";
import { parseLinkCode } from "./linkCode";
import { loadAdminLink, saveAdminLink } from "./adminStorage";

// Lógica del sitio de administración: la lista de vendedores del buzón (nombre,
// activo, código) y lo que el administrador puede hacer con ella. Cada acción
// vuelve a leer la lista del buzón, que es la que manda.

export function useAdmin({ createApi = createCloudApi } = {}) {
  const [link, setLink] = useState(() => loadAdminLink());
  const [vendors, setVendors] = useState([]);
  const [facturadora, setFacturadora] = useState(null);
  // Cuentas con usuario y contraseña de facturación y supervisión (null si el buzón no las tiene).
  const [accounts, setAccounts] = useState(null);
  // Horario de facturación (null si el buzón no lo tiene todavía).
  const [schedule, setSchedule] = useState(null);
  // Cierre de facturación del día (null si el buzón no lo tiene todavía).
  const [cierre, setCierre] = useState(null);
  // Hora del sitio: la zona horaria en la que trabaja el buzón (null si todavía no la tiene).
  const [zona, setZona] = useState(null);
  const [phase, setPhase] = useState("idle"); // idle | loading | ok | error | auth
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const linkRef = useRef(link);
  linkRef.current = link;
  const apiRef = useRef(createApi);
  apiRef.current = createApi;

  const api = useCallback(() => apiRef.current({ url: linkRef.current.url, token: linkRef.current.token }), []);

  const fail = useCallback((e) => {
    const kind = e instanceof CloudError ? e.kind : "server";
    setPhase(kind === "auth" ? "auth" : "error");
    setError(kind === "auth" ? "El código de enlace ya no sirve. Vuelve a enlazar." : (e && e.message) || "La nube tuvo un problema.");
  }, []);

  const refresh = useCallback(async () => {
    if (!linkRef.current) return false;
    setPhase((p) => (p === "ok" ? p : "loading"));
    try {
      const [data, accountData, scheduleData, cierreData, zonaData] = await Promise.all([api().adminVendors(), api().adminAccounts().catch(() => null), api().adminSchedule().catch(() => null), api().adminCierre().catch(() => null), api().adminZona().catch(() => null)]);
      setVendors(data.vendors || []);
      setFacturadora(data.facturadora || null);
      setAccounts(accountData);
      setSchedule(scheduleData);
      setCierre(cierreData);
      setZona(zonaData);
      setPhase("ok");
      setError("");
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  }, [api, fail]);

  useEffect(() => {
    if (link) refresh();
  }, [link, refresh]);

  // Corre una acción y vuelve a leer la lista; devuelve true si salió bien.
  const act = useCallback(async (run) => {
    setBusy(true);
    setError("");
    try {
      await run(api());
    } catch (e) {
      if (e instanceof CloudError && e.kind === "auth") fail(e);
      else setError((e && e.message) || "No se pudo hacer el cambio.");
      setBusy(false);
      return false;
    }
    const ok = await refresh();
    setBusy(false);
    return ok;
  }, [api, fail, refresh]);

  const loadSales = useCallback((fecha) => api().sales(fecha), [api]);

  const linkWith = useCallback(async (code) => {
    const { url, token } = parseLinkCode(code);
    const me = await apiRef.current({ url, token }).me();
    if (me.role !== "admin") throw new Error("Este código no es de administrador.");
    const next = { url, token, name: me.name, role: me.role };
    saveAdminLink(next);
    setLink(next);
    setPhase("loading");
  }, []);

  // Entrar con usuario y contraseña (un usuario administrador): el buzón da una sesión que sirve igual
  // que el código de enlace.
  const signIn = useCallback(async ({ usuario = "", clave = "" } = {}) => {
    const session = await apiRef.current({ url: CLOUD_URL, token: "" }).login(String(usuario).trim(), clave);
    if (session.role !== "admin") throw new Error("Esta cuenta no es de administrador.");
    const next = { url: CLOUD_URL, token: session.token, name: session.name, role: "admin" };
    saveAdminLink(next);
    setLink(next);
    setPhase("loading");
  }, []);

  const unlink = useCallback(() => {
    saveAdminLink(null);
    setLink(null);
    setVendors([]);
    setFacturadora(null);
    setAccounts(null);
    setSchedule(null);
    setCierre(null);
    setZona(null);
    setPhase("idle");
    setError("");
  }, []);

  return {
    link, vendors, facturadora, accounts, schedule, cierre, zona, phase, error, busy, refresh, linkWith, signIn, unlink, clearError: () => setError(""),
    addVendor: (name) => act((a) => a.addVendor(name)),
    renameVendor: (id, name) => act((a) => a.updateVendor(id, { name })),
    setActive: (id, active) => act((a) => a.updateVendor(id, { active })),
    regenerate: (id) => act((a) => a.regenerateVendor(id)),
    createAccount: (body) => act((a) => a.createAccount(body)),
    updateAccount: (id, body) => act((a) => a.updateAccount(id, body)),
    saveSchedule: (body) => act((a) => a.saveSchedule(body)),
    saveCierre: (body) => act((a) => a.saveCierre(body)),
    saveZona: (body) => act((a) => a.saveZona(body)),
    // Resumen de ventas de un día (para el contador).
    loadSales,
  };
}
