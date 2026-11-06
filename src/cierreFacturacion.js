// Cierre de facturación del día (lo pone el administrador en el buzón): pasada esta hora ya no se
// envían pedidos para hoy a facturación; los de otro día sí. Aquí se revisa en la app antes de enviar
// (el buzón también lo exige, por si el teléfono no se enteró).

// "14:00" → "2:00 p. m."
export function clock12(hhmm) {
  const hours = Number(hhmm.slice(0, 2));
  return `${hours % 12 || 12}:${hhmm.slice(3, 5)} ${hours < 12 ? "a. m." : "p. m."}`;
}

// `cierre`: { activo, hora: "HH:MM" } como lo manda el buzón (o null si todavía no se sabe).
// Devuelve el aviso para el vendedor si ya cerró, o "" si todavía se puede enviar.
export function cierreBlockMessage(cierre, now = new Date()) {
  if (!cierre || !cierre.activo || !/^\d{2}:\d{2}$/.test(cierre.hora || "")) return "";
  const closesAt = Number(cierre.hora.slice(0, 2)) * 60 + Number(cierre.hora.slice(3, 5));
  if (now.getHours() * 60 + now.getMinutes() < closesAt) return "";
  return `La facturación de hoy cerró a las ${clock12(cierre.hora)} Pasa el pedido para mañana.`;
}
