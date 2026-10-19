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

// Ventana pequeña (popup de 480x820; en el celular el navegador ignora las
// medidas y abre su pestaña personalizada) y siempre con el mismo nombre, para
// que otro toque cambie la búsqueda en la misma ventana en vez de apilar otra.
export const PORTAL_WINDOW_NAME = "procovar-portal";
export const PORTAL_WINDOW_FEATURES = "popup,width=480,height=820";

// No se usa "noopener": crea un grupo de ventanas aparte y la app ya no
// encontraría la ventana por su nombre para reutilizarla. En su lugar se suelta
// `opener` justo al abrirla, con el mismo efecto de aislar el portal de la app.
export function openPortalSearch(customerName) {
  const url = portalSearchUrl(customerName);
  if (!url) return;
  const win = window.open(url, PORTAL_WINDOW_NAME, PORTAL_WINDOW_FEATURES);
  if (win) {
    try { win.opener = null; } catch { /* ya aislada */ }
  }
}
