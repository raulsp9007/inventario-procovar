import { Clock, CornerUpRight, Trash2, Check } from "lucide-react";

// Aviso de cierre de ventas -- componente de presentación pura. La
// condición de cuándo mostrarlo (activeSection/pastCierreDeVentas) y toda
// la lógica de programar/eliminar siguen en Orders.jsx.
export default function CierreDeVentasBanner({
  unconfirmedTodayOrders, cierreVentasHour, confirmingPostponeId, confirmingDeleteId,
  onPostponeClick, onDeleteClick, onConfirmClick,
}) {
  const n = unconfirmedTodayOrders.length;
  return (
    <div style={{ background: "var(--banner-bg)", border: "1px solid var(--border-warn)", borderRadius: 12, padding: 14, marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Clock size={16} color="var(--orange)" strokeWidth={2} />
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
          Cierre de ventas{cierreVentasHour != null ? ` · ${String(cierreVentasHour).padStart(2, "0")}:00` : ""}
        </span>
      </div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>
        {n} pedido{n === 1 ? "" : "s"} de hoy sin confirmar. Revísalos antes de cerrar.
      </div>
      {unconfirmedTodayOrders.map((order, i) => (
        <div
          key={order.orderId}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderTop: i === 0 ? "none" : "1px solid var(--border-warn)" }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {order.customerName}
            </div>
            {(confirmingPostponeId === order.orderId || confirmingDeleteId === order.orderId) && (
              <div style={{ fontSize: 11, fontWeight: 600, color: confirmingDeleteId === order.orderId ? "var(--red)" : "var(--orange)" }}>
                ¿Seguro? toca de nuevo
              </div>
            )}
          </div>
          <button
            onClick={() => onPostponeClick(order)}
            title="Posponer a mañana"
            aria-label="Posponer a mañana"
            style={{
              width: 36, height: 36, borderRadius: 8, border: `1px solid ${confirmingPostponeId === order.orderId ? "var(--orange)" : "var(--border-strong)"}`,
              background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              color: confirmingPostponeId === order.orderId ? "var(--orange)" : "var(--muted)",
            }}
          >
            <CornerUpRight size={16} strokeWidth={2} />
          </button>
          <button
            onClick={() => onDeleteClick(order)}
            title="Eliminar"
            aria-label="Eliminar"
            style={{
              width: 36, height: 36, borderRadius: 8, border: `1px solid ${confirmingDeleteId === order.orderId ? "var(--red)" : "var(--border-strong)"}`,
              background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--red)",
            }}
          >
            <Trash2 size={16} strokeWidth={2} />
          </button>
          <button
            onClick={() => onConfirmClick(order)}
            title="Confirmar"
            aria-label="Confirmar"
            style={{
              width: 36, height: 36, borderRadius: 8, border: "1px solid var(--green)",
              background: "var(--green)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--cream)",
            }}
          >
            <Check size={16} strokeWidth={2.4} />
          </button>
        </div>
      ))}
    </div>
  );
}
