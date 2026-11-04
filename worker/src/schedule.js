// Horario de facturación: un solo horario (apertura y cierre) de lunes a sábado, en la hora de
// Cuba; el domingo está cerrado. Fuera de horario se pausa el sitio (los vendedores no pueden
// enviar a facturación y la facturadora no puede confirmar). Sin horario activado, siempre está
// abierto. Funciones puras.

export const TIME_ZONE = "America/Havana";
export const DEFAULT_SCHEDULE = { enabled: false, open: "09:00", close: "15:00" };

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

// "13:30" → "1:30 p. m."
export function formatTime12(hhmm) {
  const hours = Number(hhmm.slice(0, 2));
  return `${hours % 12 || 12}:${hhmm.slice(3, 5)} ${hours < 12 ? "a. m." : "p. m."}`;
}

// Día de la semana (0 = domingo) y minutos desde la medianoche, en la hora de Cuba.
function cubaClock(nowIso) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(nowIso));
  const get = (type) => parts.find((p) => p.type === type).value;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { weekday, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

// La fecha de hoy en Cuba (AAAA-MM-DD), no la de UTC.
export function cubaDate(nowIso) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(nowIso));
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
export function scheduleStatus(schedule, nowIso) {
  const base = { activo: !!schedule.enabled, abre: schedule.open, cierra: schedule.close };
  if (!schedule.enabled) return { ...base, abierto: true, mensaje: "" };
  const { weekday, minutes } = cubaClock(nowIso);
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
