import { useCallback, useEffect, useRef, useState } from "react";
import { createCloudApi, CloudError } from "./cloudApi";
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
      const [data, accountData] = await Promise.all([api().adminVendors(), api().adminAccounts().catch(() => null)]);
      setVendors(data.vendors || []);
      setFacturadora(data.facturadora || null);
      setAccounts(accountData);
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

  const linkWith = useCallback(async (code) => {
    const { url, token } = parseLinkCode(code);
    const me = await apiRef.current({ url, token }).me();
    if (me.role !== "admin") throw new Error("Este código no es de administrador.");
    const next = { url, token, name: me.name, role: me.role };
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
    setPhase("idle");
    setError("");
  }, []);

  return {
    link, vendors, facturadora, accounts, phase, error, busy, refresh, linkWith, unlink, clearError: () => setError(""),
    addVendor: (name) => act((a) => a.addVendor(name)),
    renameVendor: (id, name) => act((a) => a.updateVendor(id, { name })),
    setActive: (id, active) => act((a) => a.updateVendor(id, { active })),
    regenerate: (id) => act((a) => a.regenerateVendor(id)),
    saveAccount: (slug, body) => act((a) => a.saveAccount(slug, body)),
  };
}
