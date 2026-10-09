import { formatOrdersSummaryForSupervisor } from "./orderHelpers";

// Abre WhatsApp con el resumen de los pedidos de hoy para el supervisor (su
// teléfono viene de Configuración; sin teléfono WhatsApp deja elegir el
// contacto). Lo usan el botón de Pedidos y la pantalla de Cierre del día.
// `orders` ya viene filtrado a los de hoy. Sin pedidos avisa y no abre nada.
export function sendSupervisorSummary({ orders, products, today, senderName, supervisorPhone, onError }) {
  if (orders.length === 0) {
    onError("No hay pedidos hoy para enviar.");
    return;
  }
  const text = formatOrdersSummaryForSupervisor(orders, products, { date: today, senderName });
  window.open(`https://wa.me/${supervisorPhone || ""}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
}
