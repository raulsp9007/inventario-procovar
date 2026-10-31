// La misma app sirve para el vendedor y para la facturadora. El rol se elige con
// la dirección (?rol=facturadora, ?rol=vendedor) y queda guardado en ese teléfono:
// el APK de la facturadora arranca con esa dirección una sola vez.

export const ROLE_KEY = "procovar-rol";
const ROLES = ["vendedor", "facturadora"];

export function resolveAppRole(search = typeof window !== "undefined" ? window.location.search : "") {
  const requested = new URLSearchParams(search).get("rol");
  if (ROLES.includes(requested)) {
    try {
      window.localStorage.setItem(ROLE_KEY, requested);
    } catch {
      // Sin almacenamiento: vale para esta sesión.
    }
    return requested;
  }
  try {
    return window.localStorage.getItem(ROLE_KEY) === "facturadora" ? "facturadora" : "vendedor";
  } catch {
    return "vendedor";
  }
}
