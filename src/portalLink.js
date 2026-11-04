// Portal oficial de pedidos de Procovar. Su pantalla de Pedidos lee el
// parámetro "buscar" de la dirección y lo pone en su buscador, así que con una
// dirección se abre ya buscando al cliente. No hace falta (ni se puede, por
// CORS) hablar con su API desde la app: lo ve la persona en el portal.
export const PORTAL_BASE = "https://pedidos.procovar.cloud";

// Qué se busca en el portal para un cliente: su código; si no tiene, solo su primer nombre
// (el portal encuentra mejor con una palabra que con el nombre completo).
export function portalSearchText({ code, name } = {}) {
  const trimmedCode = (code || "").trim();
  if (trimmedCode) return trimmedCode;
  return (name || "").trim().split(/\s+/)[0] || "";
}

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
// La facturadora trabaja en computadora: una ventana emergente más ancha (el portal es un
// sitio de escritorio).
export const PORTAL_WINDOW_FEATURES_WIDE = "popup,width=1000,height=800";

// No se usa "noopener": crea un grupo de ventanas aparte y la app ya no
// encontraría la ventana por su nombre para reutilizarla. En su lugar se suelta
// `opener` justo al abrirla, con el mismo efecto de aislar el portal de la app.
// `text`: el cliente o su código (el portal busca por lo que se le ponga en `buscar`).
// `wide: true` abre la ventana emergente ancha (la de la facturadora, en computadora);
// `popup: false` abre una pestaña normal, también siempre la misma.
export function openPortalSearch(text, { popup = true, wide = false } = {}) {
  const url = portalSearchUrl(text);
  if (!url) return;
  const features = wide ? PORTAL_WINDOW_FEATURES_WIDE : PORTAL_WINDOW_FEATURES;
  const win = popup ? window.open(url, PORTAL_WINDOW_NAME, features) : window.open(url, PORTAL_WINDOW_NAME);
  if (win) {
    try { win.opener = null; } catch { /* ya aislada */ }
  }
}
