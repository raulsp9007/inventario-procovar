// Portal oficial de pedidos de Procovar. Su pantalla de Pedidos lee el
// parámetro "buscar" de la dirección y lo pone en su buscador, así que con una
// dirección se abre ya buscando al cliente. No hace falta (ni se puede, por
// CORS) hablar con su API desde la app: lo ve la persona en el portal.
export const PORTAL_BASE = "https://pedidos.procovar.cloud";

export function portalSearchUrl(customerName) {
  const name = (customerName || "").trim().replace(/\s+/g, " ");
  if (!name) return null;
  return `${PORTAL_BASE}/panel/panel-pedidos?buscar=${encodeURIComponent(name)}`;
}
