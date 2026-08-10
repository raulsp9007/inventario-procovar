import { useState } from "react";
import { Trash2, Send, Pencil } from "lucide-react";
import { todayStr } from "./dateUtils";
import { groupOrders, formatOrderForWhatsApp } from "./orderHelpers";
import { getCustomerNames, matchCustomerNames } from "./customerHelpers";

function openOrderWhatsApp(order, products) {
  const text = formatOrderForWhatsApp(order, products);
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

export default function Orders({ products, movements, stock, onConfirmOrder, onEditOrder, onDeleteOrder, onMarkSent, onError }) {
  const [customerName, setCustomerName] = useState("");
  const [isDelivery, setIsDelivery] = useState(false);
  const [qtyInputs, setQtyInputs] = useState(() =>
    products.reduce((acc, p) => ({ ...acc, [p.code]: "" }), {})
  );
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [editingOrderId, setEditingOrderId] = useState(null);

  const todaysOrders = groupOrders(movements, todayStr());
  const suggestions = showSuggestions
    ? matchCustomerNames(getCustomerNames(movements), customerName)
    : [];

  function resetForm() {
    setCustomerName("");
    setIsDelivery(false);
    setQtyInputs(products.reduce((acc, p) => ({ ...acc, [p.code]: "" }), {}));
    setEditingOrderId(null);
  }

  function startEdit(order) {
    setCustomerName(order.customerName);
    setIsDelivery(order.isDelivery);
    const inputs = products.reduce((acc, p) => ({ ...acc, [p.code]: "" }), {});
    order.lines.forEach((line) => { inputs[line.code] = String(line.qty); });
    setQtyInputs(inputs);
    setEditingOrderId(order.orderId);
  }

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
    const editingOrder = editingOrderId ? todaysOrders.find((o) => o.orderId === editingOrderId) : null;
    for (const line of lines) {
      const reserved = editingOrder
        ? (editingOrder.lines.find((l) => l.code === line.code)?.qty || 0)
        : 0;
      const available = (stock[line.code] || 0) + reserved;
      if (line.qty > available) {
        const product = products.find((p) => p.code === line.code);
        onError(`No hay suficiente stock de ${product ? product.name : line.code}.`);
        return;
      }
    }
    const draft = { customerName: customerName.trim(), isDelivery, lines };
    if (editingOrderId) {
      onEditOrder(editingOrderId, draft);
    } else {
      onConfirmOrder(draft);
    }
    resetForm();
  }

  function toggleSelected(orderId) {
    setSelectedIds((s) => {
      const next = new Set(s);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  function confirmBulkSend() {
    todaysOrders.forEach((order) => {
      if (!selectedIds.has(order.orderId)) return;
      openOrderWhatsApp(order, products);
      onMarkSent(order.orderId, true);
    });
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "#8A8574", fontWeight: 600 }}>
          {editingOrderId ? "EDITAR PEDIDO" : "NUEVO PEDIDO"}
        </div>
        {editingOrderId && (
          <button
            onClick={resetForm}
            style={{
              background: "transparent", border: "none", color: "#8A8574", fontSize: 12.5,
              cursor: "pointer", textDecoration: "underline",
            }}
          >
            Cancelar edición
          </button>
        )}
      </div>
      <div style={{ background: "#FFFFFF", border: "1px solid #E7E2D3", borderRadius: 12, padding: "16px 18px", marginBottom: 20 }}>
        <div style={{ position: "relative", marginBottom: 10 }}>
          <input
            type="text"
            placeholder="Nombre y apellidos del cliente"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            style={{
              width: "100%", border: "1px solid #E7E2D3", borderRadius: 7,
              padding: "9px 12px", fontSize: 14, boxSizing: "border-box",
            }}
          />
          {suggestions.length > 0 && (
            <div
              style={{
                position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
                background: "#FFFFFF", border: "1px solid #E7E2D3", borderRadius: 7,
                marginTop: 4, overflow: "hidden",
              }}
            >
              {suggestions.map((name) => (
                <div
                  key={name}
                  onClick={() => {
                    setCustomerName(name);
                    setShowSuggestions(false);
                  }}
                  style={{ padding: "8px 12px", fontSize: 13.5, cursor: "pointer" }}
                >
                  {name}
                </div>
              ))}
            </div>
          )}
        </div>

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
          {editingOrderId ? "Guardar cambios" : "Confirmar pedido"}
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "#8A8574", fontWeight: 600 }}>PEDIDOS DE HOY</div>
        <button
          onClick={() => (selectMode ? confirmBulkSend() : setSelectMode(true))}
          disabled={todaysOrders.length === 0 || (selectMode && selectedIds.size === 0)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: (todaysOrders.length === 0 || (selectMode && selectedIds.size === 0)) ? "#E7E2D3" : "#25D366",
            color: (todaysOrders.length === 0 || (selectMode && selectedIds.size === 0)) ? "#9A9484" : "#FFFFFF",
            border: "none", borderRadius: 7, padding: "9px 14px", fontSize: 13, fontWeight: 600,
            cursor: (todaysOrders.length === 0 || (selectMode && selectedIds.size === 0)) ? "default" : "pointer",
          }}
        >
          <Send size={14} /> {selectMode ? `Confirmar envío (${selectedIds.size})` : "Enviar por WhatsApp"}
        </button>
      </div>

      {selectMode && (
        <button
          onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}
          style={{
            background: "transparent", border: "none", color: "#8A8574", fontSize: 12.5,
            cursor: "pointer", padding: "0 0 10px", textDecoration: "underline",
          }}
        >
          Cancelar selección
        </button>
      )}

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
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {selectMode && (
                  <input
                    type="checkbox"
                    checked={order.sent || selectedIds.has(order.orderId)}
                    disabled={order.sent}
                    onChange={() => toggleSelected(order.orderId)}
                  />
                )}
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
              </div>

              {!selectMode && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#8A8574", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={order.sent}
                      onChange={(e) => onMarkSent(order.orderId, e.target.checked)}
                    />
                    Enviado
                  </label>
                  <button
                    onClick={() => startEdit(order)}
                    title="Editar pedido"
                    aria-label="Editar pedido"
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: "transparent", border: "1px solid #E7E2D3", color: "#8A8574",
                      borderRadius: 7, width: 34, height: 34, cursor: "pointer", flexShrink: 0,
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => openOrderWhatsApp(order, products)}
                    title="Enviar por WhatsApp"
                    aria-label="Enviar por WhatsApp"
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: "#25D366", color: "#FFFFFF", border: "none",
                      borderRadius: 7, width: 34, height: 34, cursor: "pointer", flexShrink: 0,
                    }}
                  >
                    <Send size={14} />
                  </button>
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
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
