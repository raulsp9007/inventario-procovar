// Cierre de facturación del día (lo pone el administrador en el buzón): pasada esta hora ya no se
// envían pedidos para hoy a facturación; los de otro día sí. Aquí se revisa en la app antes de enviar
// (el buzón también lo exige, por si el teléfono no se enteró).

// "14:00" → "2:00 p. m."
export function clock12(hhmm) {
  const hours = Number(hhmm.slice(0, 2));
  return `${hours % 12 || 12}:${hhmm.slice(3, 5)} ${hours < 12 ? "a. m." : "p. m."}`;
}

// Minutos desde la medianoche en la zona horaria del sitio; con una zona desconocida (o sin zona),
// los del teléfono.
function minutesNow(now, zone) {
  if (zone) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
      const get = (type) => Number(parts.find((p) => p.type === type).value);
      return get("hour") * 60 + get("minute");
    } catch {
      // zona que este teléfono no conoce: se usa su propia hora
    }
  }
  return now.getHours() * 60 + now.getMinutes();
}

// `cierre`: { activo, hora: "HH:MM", zona, ajuste } como lo manda el buzón (o null si todavía no se
// sabe); `zone`: la zona horaria del sitio (la hora de cierre es de esa zona); `ajuste`: los minutos
// que el administrador le sumó a esa hora al ponerla a mano (0 si es la automática).
// Devuelve el aviso para el vendedor si ya cerró, o "" si todavía se puede enviar.
export function cierreBlockMessage(cierre, now = new Date(), zone = cierre && cierre.zona) {
  // Si el buzón acaba de contestar (fresco), se hace lo que dice él: su reloj es el que cuenta.
  if (cierre && cierre.fresco) return cierre.cerrado ? (cierre.mensaje || "La facturación de hoy ya cerró. Pasa el pedido para mañana.") : "";
  if (!cierre || !cierre.activo || !/^\d{2}:\d{2}$/.test(cierre.hora || "")) return "";
  const closesAt = Number(cierre.hora.slice(0, 2)) * 60 + Number(cierre.hora.slice(3, 5));
  const shifted = new Date(now.getTime() + ((cierre.ajuste || 0) * 60000));
  if (minutesNow(shifted, zone) < closesAt) return "";
  return `La facturación de hoy cerró a las ${clock12(cierre.hora)} Pasa el pedido para mañana.`;
}
