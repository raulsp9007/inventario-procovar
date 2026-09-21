function pad(n) {
  return String(n).padStart(2, "0");
}

function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayStr() {
  return toDateStr(new Date());
}

export function tomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toDateStr(d);
}

// "3 PM" / "4:00 PM" de una hora 0-23 -- para mostrar la hora del cierre de ventas.
export function formatHour12(h) {
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${period}`;
}

export function formatDate(dateStr) {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

// Fecha corta para el selector "Para mañana" del modal de pedido -- se
// muestra como texto tocable en vez de ocupar una fila propia, no hace
// falta el año ahí.
export function formatDateShort(dateStr) {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("es-ES", { weekday: "short", day: "2-digit", month: "short" }).replace(/\.(?=\s|$)/g, "");
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
export function getWeekStartStr(referenceDateStr = todayStr()) {
  const d = new Date(referenceDateStr + "T00:00:00");
  const day = d.getDay(); // 0 = domingo, 1 = lunes, ... 6 = sábado
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return toDateStr(d);
}

// Lunes y domingo de la semana ANTERIOR a la de referenceDateStr.
export function getPreviousWeekRangeStr(referenceDateStr = todayStr()) {
  const mondayStr = getWeekStartStr(referenceDateStr);
  const monday = new Date(mondayStr + "T00:00:00");
  const prevMonday = new Date(monday);
  prevMonday.setDate(prevMonday.getDate() - 7);
  const prevSunday = new Date(monday);
  prevSunday.setDate(prevSunday.getDate() - 1);
  return { start: toDateStr(prevMonday), end: toDateStr(prevSunday) };
}

// Primer día del mes de referenceDateStr (formato "YYYY-MM-DD").
export function getMonthStartStr(referenceDateStr = todayStr()) {
  const d = new Date(referenceDateStr + "T00:00:00");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

// Fecha n días antes de referenceDateStr (formato "YYYY-MM-DD").
export function getDateNDaysAgoStr(n, referenceDateStr = todayStr()) {
  const d = new Date(referenceDateStr + "T00:00:00");
  d.setDate(d.getDate() - n);
  return toDateStr(d);
}

// Días completos transcurridos desde un timestamp ISO hasta ahora --
// usado para el recordatorio de respaldo periódico.
export function daysSince(isoTimestamp, now = new Date()) {
  const then = new Date(isoTimestamp);
  const diffMs = now.getTime() - then.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
