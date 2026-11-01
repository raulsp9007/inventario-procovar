// El enlace del administrador se guarda aparte del de la facturadora y del de los
// vendedores (comparten el mismo origen en el navegador): otra llave.
export const ADMIN_LINK_KEY = "procovar-admin-enlace";

export function loadAdminLink() {
  try {
    const raw = window.localStorage.getItem(ADMIN_LINK_KEY);
    const link = raw ? JSON.parse(raw) : null;
    return link && typeof link.url === "string" && typeof link.token === "string" ? link : null;
  } catch {
    return null;
  }
}

export function saveAdminLink(link) {
  try {
    if (link) window.localStorage.setItem(ADMIN_LINK_KEY, JSON.stringify(link));
    else window.localStorage.removeItem(ADMIN_LINK_KEY);
  } catch {
    // Sin almacenamiento: vale mientras la página siga abierta.
  }
}
