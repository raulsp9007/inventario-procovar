// Iconos que acompañan a los nombres al MOSTRARLOS (en la app y en el mensaje
// al facturador). Se agregan solo al mostrar, nunca se guardan dentro del
// nombre: así la búsqueda, el autocompletado y el registro de clientes siguen
// trabajando con el nombre limpio.
export const CUSTOMER_ICON = "👤";
export const BUSINESS_ICON = "🏪";

function withIcon(icon, name) {
  const clean = (name || "").trim();
  if (!clean) return "";
  return clean.startsWith(icon) ? clean : `${icon} ${clean}`;
}

export function customerLabel(name) {
  return withIcon(CUSTOMER_ICON, name);
}

export function businessLabel(name) {
  return withIcon(BUSINESS_ICON, name);
}
