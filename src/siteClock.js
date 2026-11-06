// El reloj del sitio. El buzón sabe qué hora y qué día es "de verdad" para el negocio (su zona horaria y, si el
// administrador la puso a mano, la corrección): esa es la correcta. La app del vendedor la aprende del buzón y la usa
// para saber qué día es (hoy / mañana) y si ya pasó una hora (cierre), en vez de fiarse del reloj del teléfono.
//
// `siteNow()` devuelve un Date cuyos métodos locales (getHours, getDate, ...) marcan la hora de pared del sitio, así
// el resto de la app los lee igual que siempre. Lo guardado (`timestamp`, etc.) sigue siendo la hora real.

const KEY = "procovar-reloj-sitio";

let offsetMs = 0;
let known = false;

function remember() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ offsetMs }));
  } catch {
    // sin almacenamiento: vale esta sesión
  }
}

try {
  const saved = JSON.parse(localStorage.getItem(KEY) || "null");
  if (saved && Number.isFinite(saved.offsetMs)) {
    offsetMs = saved.offsetMs;
    known = true;
  }
} catch {
  // nada guardado
}

export const hasSiteClock = () => known;

export const siteNow = () => new Date(Date.now() + offsetMs);

// `data`: lo que manda el buzón: { now (hora real del buzón), zona, ajuste (minutos) }.
export function setSiteClock(data) {
  if (!data || typeof data.now !== "string") return;
  const base = new Date(data.now).getTime();
  if (Number.isNaN(base)) return;
  const adjust = Number.isFinite(data.ajuste) ? data.ajuste : 0;
  let wall = null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: data.zona, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(base + adjust * 60000));
    const get = (type) => Number(parts.find((p) => p.type === type).value);
    wall = new Date(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  } catch {
    wall = null; // zona que este teléfono no conoce
  }
  // Con la zona: la hora de pared de allí. Sin ella: la del teléfono con la corrección.
  offsetMs = wall ? wall.getTime() - Date.now() : adjust * 60000;
  known = true;
  remember();
}

export function clearSiteClock() {
  offsetMs = 0;
  known = false;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nada que quitar
  }
}
