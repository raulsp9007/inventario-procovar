import { useState } from "react";
import { Trash2, Send, Pencil, ChevronDown, ChevronUp, CheckCheck } from "lucide-react";
import { todayStr, formatDate, formatDateTime, getDateNDaysAgoStr } from "./dateUtils";
import { formatCUP } from "./money";
import { groupAllOrders, formatOrderForWhatsApp } from "./orderHelpers";
import { getCustomerNames, matchCustomerNames } from "./customerHelpers";

const PAST_ORDERS_DAYS = 14;

function openOrderWhatsApp(order, products, phone, senderOptions) {
  const text = formatOrderForWhatsApp(order, products, senderOptions);
  const url = `https://wa.me/${phone || ""}?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function orderTotal(order) {
  return order.lines.reduce((sum, l) => sum + l.qty * (l.unitPrice || 0), 0);
}

function draftTotal(draftLines, prices) {
  return draftLines.reduce((sum, l) => sum + (Number(l.qty) || 0) * (prices[l.code] || 0), 0);
}

export default function Orders({ products, movements, stock, prices, showPrices, whatsappPhone, senderName, sendSenderName, onConfirmOrder, onEditOrder, onDeleteOrder, onMarkSent, onMarkOrdersSent, onMarkConfirmed, onError }) {
  const senderOptions = { senderName, sendSenderName };
  const [customerName, setCustomerName] = useState("");
  const [isDelivery, setIsDelivery] = useState(false);
  const [draftLines, setDraftLines] = useState([]);
  const [selectedProductCode, setSelectedProductCode] = useState("");
  const [pendingQty, setPendingQty] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [showPast, setShowPast] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);
  const [todayOrderSort, setTodayOrderSort] = useState("recent");
  const [orderSearch, setOrderSearch] = useState("");

  const today = todayStr();
  const allOrders = groupAllOrders(movements);
  const searchTerm = orderSearch.trim().toLowerCase();
  const matchesSearch = (order) => !searchTerm || order.customerName.toLowerCase().includes(searchTerm);
  const todaysOrders = allOrders.filter((o) => o.date === today && matchesSearch(o));
  const sortedTodaysOrders = [...todaysOrders].sort((a, b) =>
    todayOrderSort === "recent" ? b.timestamp.localeCompare(a.timestamp) : a.timestamp.localeCompare(b.timestamp)
  );
  const pastCutoff = getDateNDaysAgoStr(PAST_ORDERS_DAYS, today);
  const pastOrdersByDate = new Map();
  allOrders
    .filter((o) => o.date !== today && o.date >= pastCutoff && matchesSearch(o))
    .forEach((o) => {
      if (!pastOrdersByDate.has(o.date)) pastOrdersByDate.set(o.date, []);
      pastOrdersByDate.get(o.date).push(o);
    });
  const pastDatesDesc = Array.from(pastOrdersByDate.keys()).sort((a, b) => b.localeCompare(a));
  const pastOrdersCount = pastDatesDesc.reduce((sum, d) => sum + pastOrdersByDate.get(d).length, 0);

  const availableProducts = products.filter((p) => !p.archived && !draftLines.some((l) => l.code === p.code));
  const effectiveSelectedProductCode = availableProducts.some((p) => p.code === selectedProductCode)
    ? selectedProductCode
    : (availableProducts[0]?.code || "");

  const suggestions = showSuggestions
    ? matchCustomerNames(getCustomerNames(movements), customerName)
    : [];

  function resetForm() {
    setCustomerName("");
    setIsDelivery(false);
    setDraftLines([]);
    setPendingQty("");
    setEditingOrderId(null);
  }

  function startEdit(order) {
    setCustomerName(order.customerName);
    setIsDelivery(order.isDelivery);
    setDraftLines(order.lines.map((l) => ({ code: l.code, qty: String(l.qty) })));
    setPendingQty("");
    setEditingOrderId(order.orderId);
  }

  function addDraftLine() {
    if (!effectiveSelectedProductCode) return;
    const qty = parseInt(pendingQty, 10);
    if (!pendingQty || isNaN(qty) || qty <= 0) {
      onError("Ingresa una cantidad válida.");
      return;
    }
    setDraftLines((lines) => [...lines, { code: effectiveSelectedProductCode, qty: String(qty) }]);
    setPendingQty("");
  }

  function updateDraftLineQty(code, value) {
    setDraftLines((lines) => lines.map((l) => (l.code === code ? { ...l, qty: value } : l)));
  }

  function removeDraftLine(code) {
    setDraftLines((lines) => lines.filter((l) => l.code !== code));
  }

  function confirmOrder() {
    if (!customerName.trim()) {
      onError("Ingresa el nombre del cliente.");
      return;
    }
    const lines = draftLines
      .map((l) => ({ code: l.code, qty: parseInt(l.qty, 10) }))
      .filter((l) => !isNaN(l.qty) && l.qty > 0);
    if (lines.length === 0) {
      onError("Agrega al menos un producto al pedido.");
      return;
    }
    const editingOrder = editingOrderId ? allOrders.find((o) => o.orderId === editingOrderId) : null;
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

  function handleDeleteClick(orderId) {
    if (confirmingDeleteId === orderId) {
      onDeleteOrder(orderId);
      setConfirmingDeleteId(null);
      return;
    }
    setConfirmingDeleteId(orderId);
    setTimeout(() => {
      setConfirmingDeleteId((current) => (current === orderId ? null : current));
    }, 3000);
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
    const idsToSend = [];
    todaysOrders.forEach((order) => {
      if (!selectedIds.has(order.orderId)) return;
      openOrderWhatsApp(order, products, whatsappPhone, senderOptions);
      idsToSend.push(order.orderId);
    });
    onMarkOrdersSent(idsToSend, true);
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function renderOrderRow(order, i, { inSelectMode }) {
    return (
      <div
        key={order.orderId}
        style={{
          padding: "12px 16px", fontSize: 13.5,
          borderTop: i === 0 ? "none" : "1px solid #F0EDE2",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          {inSelectMode && (
            <input
              type="checkbox"
              checked={order.sent || selectedIds.has(order.orderId)}
              disabled={order.sent}
              onChange={() => toggleSelected(order.orderId)}
              style={{ marginTop: 2, flexShrink: 0 }}
            />
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>
              {order.isDelivery ? "🛺 " : ""}{order.customerName}
            </div>
            <div style={{ color: "#9A9484", fontSize: 12.5 }}>
              {order.lines.map((line) => {
                const product = products.find((p) => p.code === line.code);
                return `${line.qty}x ${product ? product.short : line.code}`;
              }).join(", ")}
              {showPrices && ` · ${formatCUP(orderTotal(order))}`}
            </div>
            <div style={{ color: "#B5AF9C", fontSize: 11.5, marginTop: 2 }}>
              {formatDateTime(order.timestamp)}
            </div>
          </div>
        </div>

        {!inSelectMode && (
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 10 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#8A8574", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={order.sent}
                  onChange={(e) => onMarkSent(order.orderId, e.target.checked)}
                />
                Enviado
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#8A8574", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={order.confirmed}
                  onChange={(e) => onMarkConfirmed(order.orderId, e.target.checked)}
                />
                <CheckCheck size={13} /> Confirmado
              </label>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
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
                onClick={() => {
                  openOrderWhatsApp(order, products, whatsappPhone, senderOptions);
                  onMarkSent(order.orderId, true);
                }}
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
                onClick={() => handleDeleteClick(order.orderId)}
                title={confirmingDeleteId === order.orderId ? "Confirmar eliminación" : "Eliminar pedido"}
                aria-label={confirmingDeleteId === order.orderId ? "Confirmar eliminación" : "Eliminar pedido"}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  gap: 4, width: confirmingDeleteId === order.orderId ? "auto" : 34, height: 34,
                  padding: confirmingDeleteId === order.orderId ? "0 10px" : 0,
                  background: confirmingDeleteId === order.orderId ? "#B4291E" : "transparent",
                  border: confirmingDeleteId === order.orderId ? "1px solid #B4291E" : "1px solid #E7E2D3",
                  color: confirmingDeleteId === order.orderId ? "#FFFFFF" : "#8A8574",
                  borderRadius: 7, cursor: "pointer", flexShrink: 0, fontSize: 12, fontWeight: 600,
                }}
              >
                <Trash2 size={14} />
                {confirmingDeleteId === order.orderId && "¿Seguro?"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
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

        {draftLines.length > 0 && (
          <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
            {draftLines.map((line) => {
              const product = products.find((p) => p.code === line.code);
              return (
                <div key={line.code} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 13.5 }}>{product ? product.name : line.code}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={line.qty}
                      onChange={(e) => updateDraftLineQty(line.code, e.target.value)}
                      style={{
                        width: 60, textAlign: "right", border: "1px solid #E7E2D3", borderRadius: 7,
                        padding: "6px 8px", fontSize: 14, fontVariantNumeric: "tabular-nums",
                      }}
                    />
                    <button
                      onClick={() => removeDraftLine(line.code)}
                      title="Quitar producto"
                      aria-label="Quitar producto"
                      style={{
                        background: "transparent", border: "none", color: "#8A8574",
                        cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 4px",
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
            {showPrices && (
              <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 13.5, fontWeight: 600 }}>
                Total: {formatCUP(draftTotal(draftLines, prices))}
              </div>
            )}
          </div>
        )}

        {availableProducts.length > 0 ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              value={effectiveSelectedProductCode}
              onChange={(e) => setSelectedProductCode(e.target.value)}
              style={{
                flex: "1 1 auto", border: "1px solid #E7E2D3", borderRadius: 7,
                padding: "9px 10px", fontSize: 14, background: "#FFFFFF",
              }}
            >
              {availableProducts.map((p) => (
                <option key={p.code} value={p.code}>{p.name}</option>
              ))}
            </select>
            <input
              type="number"
              inputMode="numeric"
              placeholder="Cant."
              value={pendingQty}
              onChange={(e) => setPendingQty(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addDraftLine(); }}
              style={{
                width: 70, textAlign: "right", border: "1px solid #E7E2D3", borderRadius: 7,
                padding: "9px 10px", fontSize: 14, fontVariantNumeric: "tabular-nums",
              }}
            />
            <button
              onClick={addDraftLine}
              style={{
                flex: "0 0 auto", background: "#22261F", color: "#F7F4EC", border: "none",
                borderRadius: 7, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              Agregar
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: "#9A9484" }}>Todos los productos ya están en el pedido.</div>
        )}

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

      <input
        type="text"
        placeholder="Buscar cliente en pedidos"
        value={orderSearch}
        onChange={(e) => setOrderSearch(e.target.value)}
        style={{
          width: "100%", border: "1px solid #E7E2D3", borderRadius: 7,
          padding: "9px 12px", fontSize: 14, boxSizing: "border-box", marginBottom: 14,
        }}
      />

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

      {!selectMode && todaysOrders.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <select
            value={todayOrderSort}
            onChange={(e) => setTodayOrderSort(e.target.value)}
            style={{
              border: "1px solid #E7E2D3", borderRadius: 7,
              padding: "7px 10px", fontSize: 12.5, background: "#FFFFFF", color: "#8A8574",
            }}
          >
            <option value="recent">Más recientes primero</option>
            <option value="oldest">Más antiguos primero</option>
          </select>
        </div>
      )}

      {todaysOrders.length === 0 ? (
        <div style={{ fontSize: 13.5, color: "#9A9484", padding: "10px 2px" }}>
          {searchTerm ? `Ningún pedido de hoy coincide con "${orderSearch}".` : "Aún no hay pedidos hoy."}
        </div>
      ) : (
        <div style={{ background: "#FFFFFF", border: "1px solid #E7E2D3", borderRadius: 12, overflow: "hidden" }}>
          {sortedTodaysOrders.map((order, i) => renderOrderRow(order, i, { inSelectMode: selectMode }))}
        </div>
      )}

      {pastOrdersCount > 0 && (
        <div style={{ marginTop: 20 }}>
          <button
            onClick={() => setShowPast((s) => !s)}
            style={{
              display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none",
              color: "#8A8574", fontSize: 12, letterSpacing: "0.1em", fontWeight: 600, cursor: "pointer",
              padding: 0, marginBottom: showPast ? 10 : 0,
            }}
          >
            {showPast ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            PEDIDOS ANTERIORES ({pastOrdersCount})
          </button>

          {showPast && pastDatesDesc.map((date) => (
            <div key={date} style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, color: "#9A9484", marginBottom: 6 }}>
                {formatDate(date)}
              </div>
              <div style={{ background: "#FFFFFF", border: "1px solid #E7E2D3", borderRadius: 12, overflow: "hidden" }}>
                {pastOrdersByDate.get(date).map((order, i) => renderOrderRow(order, i, { inSelectMode: false }))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
