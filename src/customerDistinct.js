// Pares de clientes que la persona marcó como "no son el mismo" (para que no
// vuelvan a salir en Clientes parecidos). Guardado aparte del estado de la app,
// como preferencia de este teléfono.

export const DISTINCT_KEY = "procovar-clientes-distintos";

export function loadDistinct() {
  try {
    const list = JSON.parse(window.localStorage.getItem(DISTINCT_KEY) || "[]");
    return Array.isArray(list) ? list.filter((key) => typeof key === "string") : [];
  } catch {
    return [];
  }
}

export function saveDistinct(list) {
  try {
    window.localStorage.setItem(DISTINCT_KEY, JSON.stringify(list));
  } catch {
    // Sin almacenamiento: vale solo para esta sesión.
  }
}
