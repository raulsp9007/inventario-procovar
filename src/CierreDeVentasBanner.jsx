import Banner from "./Banner.jsx";

// Aviso de cierre de ventas -- componente de presentación pura. La
// condición de cuándo mostrarlo (activeSection/pastCierreDeVentas) y toda
// la lógica de programar/eliminar siguen en Orders.jsx.
export default function CierreDeVentasBanner({
  unconfirmedTodayOrders, confirmingPostponeId, confirmingDeleteId,
  onPostponeClick, onDeleteClick, onConfirmClick,
}) {
  return (
    <Banner variant="warning" style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>
        Cierre de ventas: {unconfirmedTodayOrders.length} pedido{unconfirmedTodayOrders.length === 1 ? "" : "s"} de hoy sin confirmar
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {unconfirmedTodayOrders.map((order) => (
          <div key={order.orderId} style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span>{order.customerName}</span>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button
                onClick={() => onConfirmClick(order)}
                style={{
                  background: "transparent", color: "var(--accent-green-text)", border: "1px solid var(--accent-green-text)",
                  borderRadius: 7, padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >
                Confirmar
              </button>
              <button
                onClick={() => onPostponeClick(order)}
                style={{
                  background: "var(--ink)", color: "var(--cream)", border: "none",
                  borderRadius: 7, padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >
                {confirmingPostponeId === order.orderId ? "¿Seguro?" : "Programar mañana"}
              </button>
              <button
                onClick={() => onDeleteClick(order)}
                style={{
                  background: "transparent", color: "var(--warning-text)", border: "1px solid var(--border-warn)",
                  borderRadius: 7, padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >
                {confirmingDeleteId === order.orderId ? "¿Seguro?" : "Eliminar"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </Banner>
  );
}
