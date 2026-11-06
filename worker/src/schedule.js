// Horario de facturación: un solo horario (apertura y cierre) de lunes a sábado, en la hora del
// sitio (por defecto la de Cuba; el administrador puede elegir otra zona); el domingo está cerrado. Fuera de horario se pausa el sitio (los vendedores no pueden
// enviar a facturación y la facturadora no puede confirmar). Sin horario activado, siempre está
// abierto. Funciones puras.

export const DEFAULT_ZONE = "America/Havana";
export const TIME_ZONE = DEFAULT_ZONE;

// Zonas horarias entre las que elige el administrador (la hora a la que trabaja el sitio).
export const ZONES = [
  { id: "America/Havana", label: "Cuba (La Habana)" },
  { id: "America/New_York", label: "Este de EE. UU. (Miami, Nueva York)" },
  { id: "America/Chicago", label: "Centro de EE. UU. (Chicago)" },
  { id: "America/Mexico_City", label: "México (Ciudad de México)" },
  { id: "America/Bogota", label: "Colombia, Perú, Ecuador (Bogotá)" },
  { id: "America/Panama", label: "Panamá" },
  { id: "America/Caracas", label: "Venezuela (Caracas)" },
  { id: "America/Santo_Domingo", label: "República Dominicana" },
  { id: "America/Argentina/Buenos_Aires", label: "Argentina (Buenos Aires)" },
  { id: "Europe/Madrid", label: "España (Madrid)" },
  { id: "UTC", label: "UTC" },
];

// Lo guardado como zona; si falta o no está en la lista, la de por defecto.
export function parseZone(raw) {
  return ZONES.some((zone) => zone.id === raw) ? raw : DEFAULT_ZONE;
}

// Hora puesta a mano: el administrador dice qué hora es ahora en el sitio ("HH:MM") y se guarda la
// diferencia, en minutos, con la hora de la zona (la más corta: de -12 h a +12 h). Ese ajuste se
// suma después al reloj para el horario, el cierre del día y el día de hoy.
const DAY_MIN = 24 * 60;
export function adjustFromManual(hhmm, nowIso, zone = DEFAULT_ZONE) {
  const diff = toMinutes(hhmm) - cubaClock(nowIso, zone).minutes;
  return ((((diff + DAY_MIN / 2) % DAY_MIN) + DAY_MIN) % DAY_MIN) - DAY_MIN / 2;
}

// Lo guardado (texto) como ajuste en minutos; si falta, está roto o es absurdo (más de 12 h), 0.
export function parseAdjust(raw) {
  const value = typeof raw === "string" && /^-?\d{1,4}$/.test(raw) ? Number(raw) : 0;
  return Math.abs(value) <= DAY_MIN / 2 ? value : 0;
}

export const shiftIso = (nowIso, minutes) => new Date(new Date(nowIso).getTime() + minutes * 60000).toISOString();

export const isTimeOfDay = (value) => typeof value === "string" && TIME_PATTERN.test(value);

export const zoneLabel = (zone) => (ZONES.find((z) => z.id === zone) || ZONES[0]).label;
export const DEFAULT_SCHEDULE = { enabled: false, open: "09:00", close: "15:00" };

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

// "13:30" → "1:30 p. m."
export function formatTime12(hhmm) {
  const hours = Number(hhmm.slice(0, 2));
  return `${hours % 12 || 12}:${hhmm.slice(3, 5)} ${hours < 12 ? "a. m." : "p. m."}`;
}

// Día de la semana (0 = domingo) y minutos desde la medianoche, en la hora de la zona.
function cubaClock(nowIso, zone = DEFAULT_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(nowIso));
  const get = (type) => parts.find((p) => p.type === type).value;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { weekday, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

// La fecha de hoy en la zona del sitio (AAAA-MM-DD), no la de UTC. (El nombre viene de cuando solo
// existía la hora de Cuba.)
export function cubaDate(nowIso, zone = DEFAULT_ZONE) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(nowIso));
}

// La fecha y la hora ("HH:MM") que son ahora en la zona.
export function siteNow(nowIso, zone = DEFAULT_ZONE) {
  const { minutes } = cubaClock(nowIso, zone);
  return { fecha: cubaDate(nowIso, zone), hora: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}` };
}

// Valida lo que manda el administrador: { value } o { error }.
export function validateSchedule(input) {
  const body = input && typeof input === "object" ? input : {};
  if (typeof body.enabled !== "boolean") return { error: "Activo debe ser verdadero o falso." };
  if (typeof body.open !== "string" || !TIME_PATTERN.test(body.open)) return { error: "La hora de apertura no es válida (formato HH:MM)." };
  if (typeof body.close !== "string" || !TIME_PATTERN.test(body.close)) return { error: "La hora de cierre no es válida (formato HH:MM)." };
  if (toMinutes(body.open) >= toMinutes(body.close)) return { error: "La hora de apertura debe ser antes que la de cierre." };
  return { value: { enabled: body.enabled, open: body.open, close: body.close } };
}

// Lo guardado (texto JSON) como horario; si falta o está roto, el valor por defecto (apagado).
export function parseSchedule(raw) {
  if (typeof raw !== "string") return { ...DEFAULT_SCHEDULE };
  try {
    const { value } = validateSchedule(JSON.parse(raw));
    return value || { ...DEFAULT_SCHEDULE };
  } catch {
    return { ...DEFAULT_SCHEDULE };
  }
}

// Cómo está el horario ahora: { activo, abierto, abre, cierra, mensaje }.
export function scheduleStatus(schedule, nowIso, zone = DEFAULT_ZONE) {
  const base = { activo: !!schedule.enabled, abre: schedule.open, cierra: schedule.close };
  if (!schedule.enabled) return { ...base, abierto: true, mensaje: "" };
  const { weekday, minutes } = cubaClock(nowIso, zone);
  const open = toMinutes(schedule.open);
  const close = toMinutes(schedule.close);
  const opens = formatTime12(schedule.open);
  if (weekday !== 0 && minutes >= open && minutes < close) return { ...base, abierto: true, mensaje: "" };
  if (weekday === 0) return { ...base, abierto: false, mensaje: `La facturación está cerrada hoy (domingo). Abre el lunes a las ${opens}` };
  if (minutes < open) return { ...base, abierto: false, mensaje: `La facturación está cerrada. Abre hoy a las ${opens}` };
  // Ya cerró: el próximo día de apertura (el domingo no se abre).
  const tomorrow = (weekday + 1) % 7;
  const when = tomorrow === 0 ? `el ${DAYS[1]}` : `mañana ${DAYS[tomorrow]}`;
  return { ...base, abierto: false, mensaje: `La facturación está cerrada. Abre ${when} a las ${opens}` };
}

// Cierre de facturación del día: pasada esta hora ya no se envían pedidos para hoy (sí para otro día;
// borrar y confirmar siguen). Es aparte del horario del sitio, que lo pausa todo. Hora de Cuba.
export const DEFAULT_CIERRE = { enabled: false, time: "15:00" };

// Valida lo que manda el administrador: { value } o { error }.
export function validateCierre(input) {
  const body = input && typeof input === "object" ? input : {};
  if (typeof body.enabled !== "boolean") return { error: "Activo debe ser verdadero o falso." };
  if (typeof body.time !== "string" || !TIME_PATTERN.test(body.time)) return { error: "La hora de cierre no es válida (formato HH:MM)." };
  return { value: { enabled: body.enabled, time: body.time } };
}

// Lo guardado (texto JSON) como cierre; si falta o está roto, el valor por defecto (apagado).
export function parseCierre(raw) {
  if (typeof raw !== "string") return { ...DEFAULT_CIERRE };
  try {
    const { value } = validateCierre(JSON.parse(raw));
    return value || { ...DEFAULT_CIERRE };
  } catch {
    return { ...DEFAULT_CIERRE };
  }
}

// Cómo está el cierre ahora: { activo, hora, cerrado, mensaje }.
export function cierreStatus(cierre, nowIso, zone = DEFAULT_ZONE) {
  const base = { activo: !!cierre.enabled, hora: cierre.time };
  if (!cierre.enabled || cubaClock(nowIso, zone).minutes < toMinutes(cierre.time)) return { ...base, cerrado: false, mensaje: "" };
  return { ...base, cerrado: true, mensaje: `La facturación de hoy cerró a las ${formatTime12(cierre.time)} Pasa el pedido para mañana.` };
}
