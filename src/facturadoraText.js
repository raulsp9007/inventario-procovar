// Textos de la página de la facturadora, en palabras de todos los días. Funciones puras.

const plural = (n, one, many) => (n === 1 ? one : many);

// Hora en formato de 12 horas: "4:43 p. m.". Vacío si no es una fecha.
export function clock12(value) {
  if (value === null || value === undefined) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const hours = d.getHours();
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(d.getMinutes()).padStart(2, "0")} ${hours < 12 ? "a. m." : "p. m."}`;
}

// Cómo va la conexión con la nube, dicho sin tecnicismos.
export function connectionText(f) {
  const time = clock12(f.lastSyncAt);
  const parts = [];
  if (f.phase === "ok") parts.push(`Todo en orden. Actualizado a las ${time}`);
  else if (f.phase === "offline") parts.push(time ? `No hay internet. Estás viendo lo último que llegó a las ${time}` : "No hay internet.");
  else if (f.phase === "auth" || f.phase === "error") parts.push("Hubo un problema al conectar. Se volverá a intentar solo.");
  else parts.push("Conectando…");
  if (f.pendingOps > 0) {
    parts.push(`${f.pendingOps} ${plural(f.pendingOps, "confirmación sin enviar: se enviará", "confirmaciones sin enviar: se enviarán")} cuando vuelva el internet.`);
  }
  return parts.join(" ");
}

export function newOrdersText(count) {
  return count === 1 ? "Llegó 1 pedido nuevo" : `Llegaron ${count} pedidos nuevos`;
}
