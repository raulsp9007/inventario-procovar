function pad(n) {
  return String(n).padStart(2, "0");
}

function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayStr() {
  return toDateStr(new Date());
}

// Día "hábil" del negocio: pedidos hechos despues de las 4pm (hora del
// dispositivo) cuentan para el día siguiente, no para hoy.
const CUTOFF_HOUR = 16;

export function businessDayStr(now = new Date()) {
  const d = new Date(now);
  if (d.getHours() >= CUTOFF_HOUR) {
    d.setDate(d.getDate() + 1);
  }
  return toDateStr(d);
}

export function formatDate(dateStr) {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(isoTimestamp) {
  const date = new Date(isoTimestamp);
  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Lunes de la semana de referenceDateStr (formato "YYYY-MM-DD").
export function getWeekStartStr(referenceDateStr = businessDayStr()) {
  const d = new Date(referenceDateStr + "T00:00:00");
  const day = d.getDay(); // 0 = domingo, 1 = lunes, ... 6 = sábado
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return toDateStr(d);
}

// Lunes y domingo de la semana ANTERIOR a la de referenceDateStr.
export function getPreviousWeekRangeStr(referenceDateStr = businessDayStr()) {
  const mondayStr = getWeekStartStr(referenceDateStr);
  const monday = new Date(mondayStr + "T00:00:00");
  const prevMonday = new Date(monday);
  prevMonday.setDate(prevMonday.getDate() - 7);
  const prevSunday = new Date(monday);
  prevSunday.setDate(prevSunday.getDate() - 1);
  return { start: toDateStr(prevMonday), end: toDateStr(prevSunday) };
}

// Primer día del mes de referenceDateStr (formato "YYYY-MM-DD").
export function getMonthStartStr(referenceDateStr = businessDayStr()) {
  const d = new Date(referenceDateStr + "T00:00:00");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

// Fecha n días antes de referenceDateStr (formato "YYYY-MM-DD").
export function getDateNDaysAgoStr(n, referenceDateStr = businessDayStr()) {
  const d = new Date(referenceDateStr + "T00:00:00");
  d.setDate(d.getDate() - n);
  return toDateStr(d);
}
