import { useState } from "react";
import { Trash2, Send } from "lucide-react";
import { todayStr } from "./dateUtils";
import { groupOrders, formatOrdersForWhatsApp } from "./orderHelpers";

export default function Orders({ products, movements, stock, onConfirmOrder, onDeleteOrder, onError }) {
  const [customerName, setCustomerName] = useState("");
  const [isDelivery, setIsDelivery] = useState(false);
  const [qtyInputs, setQtyInputs] = useState(() =>
    products.reduce((acc, p) => ({ ...acc, [p.code]: "" }), {})
  );

  const todaysOrders = groupOrders(movements, todayStr());

  function confirmOrder() {
    if (!customerName.trim()) {
      onError("Ingresa el nombre del cliente.");
      return;
    }
    const lines = products
      .map((p) => ({ code: p.code, qty: parseInt(qtyInputs[p.code], 10) }))
      .filter((line) => !isNaN(line.qty) && line.qty > 0);
    if (lines.length === 0) {
      onError("Agrega al menos un producto al pedido.");
      return;
    }
    for (const line of lines) {
      const available = stock[line.code] || 0;
      if (line.qty > available) {
        const product = products.find((p) => p.code === line.code);
        onError(`No hay suficiente stock de ${product ? product.name : line.code}.`);
        return;
      }
    }
    onConfirmOrder({ customerName: customerName.trim(), isDelivery, lines });
    setCustomerName("");
    setIsDelivery(false);
    setQtyInputs(products.reduce((acc, p) => ({ ...acc, [p.code]: "" }), {}));
  }

  function sendWhatsApp() {
    const text = formatOrdersForWhatsApp(todaysOrders, products);
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div>
      <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "#8A8574", fontWeight: 600, marginBottom: 10 }}>
        NUEVO PEDIDO
      </div>
      <div style={{ background: "#FFFFFF", border: "1px solid #E7E2D3", borderRadius: 12, padding: "16px 18px", marginBottom: 20 }}>
        <input
          type="text"
          placeholder="Nombre y apellidos del cliente"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          style={{
            width: "100%", border: "1px solid #E7E2D3", borderRadius: 7,
            padding: "9px 12px", fontSize: 14, marginBottom: 10,
          }}
        />

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "#8A8574", marginBottom: 14, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={isDelivery}
            onChange={(e) => setIsDelivery(e.target.checked)}
          />
          Entrega a domicilio
        </label>

        <div style={{ display: "grid", gap: 8 }}>
          {products.map((p) => (
            <div key={p.code} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 13.5 }}>{p.name}</span>
              <input
                type="number"
                inputMode="numeric"
                placeholder="0"
                value={qtyInputs[p.code]}
                onChange={(e) => setQtyInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                style={{
                  width: 70, textAlign: "right", border: "1px solid #E7E2D3", borderRadius: 7,
                  padding: "7px 10px", fontSize: 14, fontVariantNumeric: "tabular-nums",
                }}
              />
            </div>
          ))}
        </div>

        <button
          onClick={confirmOrder}
          style={{
            marginTop: 16, width: "100%", background: "#22261F", color: "#F7F4EC", border: "none",
            borderRadius: 7, padding: "11px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}
        >
          Confirmar pedido
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "#8A8574", fontWeight: 600 }}>PEDIDOS DE HOY</div>
        <button
          onClick={sendWhatsApp}
          disabled={todaysOrders.length === 0}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: todaysOrders.length === 0 ? "#E7E2D3" : "#25D366",
            color: todaysOrders.length === 0 ? "#9A9484" : "#FFFFFF",
            border: "none", borderRadius: 7, padding: "9px 14px", fontSize: 13, fontWeight: 600,
            cursor: todaysOrders.length === 0 ? "default" : "pointer",
          }}
        >
          <Send size={14} /> Enviar por WhatsApp
        </button>
      </div>

      {todaysOrders.length === 0 ? (
        <div style={{ fontSize: 13.5, color: "#9A9484", padding: "10px 2px" }}>
          Aún no hay pedidos hoy.
        </div>
      ) : (
        <div style={{ background: "#FFFFFF", border: "1px solid #E7E2D3", borderRadius: 12, overflow: "hidden" }}>
          {todaysOrders.map((order, i) => (
            <div
              key={order.orderId}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                gap: 8, padding: "12px 16px", fontSize: 13.5,
                borderTop: i === 0 ? "none" : "1px solid #F0EDE2",
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>
                  {order.isDelivery ? "📦 " : ""}{order.customerName}
                </div>
                <div style={{ color: "#9A9484", fontSize: 12.5 }}>
                  {order.lines.map((line) => {
                    const product = products.find((p) => p.code === line.code);
                    return `${line.qty}x ${product ? product.short : line.code}`;
                  }).join(", ")}
                </div>
              </div>
              <button
                onClick={() => onDeleteOrder(order.orderId)}
                title="Eliminar pedido"
                aria-label="Eliminar pedido"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "transparent", border: "1px solid #E7E2D3", color: "#8A8574",
                  borderRadius: 7, width: 34, height: 34, cursor: "pointer", flexShrink: 0,
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
