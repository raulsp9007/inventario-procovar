import { useState, useEffect, useRef } from "react";
import { Trash2, Send, Pencil, ChevronDown, ChevronUp, CheckCheck, CalendarClock } from "lucide-react";
import { todayStr, tomorrowStr, isPastCutoffNow, wasSentAfterCutoffToday, formatDate, formatDateTime, getDateNDaysAgoStr } from "./dateUtils";
import { formatCUP } from "./money";
import { groupAllOrders, formatOrderForWhatsApp } from "./orderHelpers";
import { getCustomerNames, matchCustomerNames } from "./customerHelpers";

const PAST_ORDERS_DAYS = 14;
const FILTERS_STORAGE_KEY = "procovar-pedidos-filtros";

function loadSavedFilters() {
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

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

export default function Orders({ products, movements, stock, prices, showPrices, whatsappPhone, senderName, sendSenderName, lowStockThresholdFor, onConfirmOrder, onEditOrder, onDeleteOrder, onPostponeOrder, onMarkSent, onMarkOrdersSent, onMarkConfirmed, onError }) {
  const senderOptions = { senderName, sendSenderName };
  const [customerName, setCustomerName] = useState("");
  const [isDelivery, setIsDelivery] = useState(false);
  const [note, setNote] = useState("");
  const [draftLines, setDraftLines] = useState([]);
  const [selectedProductCode, setSelectedProductCode] = useState("");
  const [pendingQty, setPendingQty] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [showPast, setShowPast] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);
  const [postponeWarning, setPostponeWarning] = useState(null);
  const [bigOrderWarning, setBigOrderWarning] = useState(null);
  const [todayOrderSort, setTodayOrderSort] = useState(() => (loadSavedFilters().sort === "oldest" ? "oldest" : "recent"));
  const [orderSearch, setOrderSearch] = useState("");
  const [filterUnsent, setFilterUnsent] = useState(() => !!loadSavedFilters().filterUnsent);
  const [filterUnconfirmed, setFilterUnconfirmed] = useState(() => !!loadSavedFilters().filterUnconfirmed);
  // Bloquea envíos repetidos (doble clic/doble toque) mientras el formulario
  // todavía no reflejó el reset -- el estado de React (customerName, etc.)
  // se actualiza en batch, así que un segundo click puede leer el mismo
  // formulario "todavía lleno" antes de que se limpie. El ref cambia de
  // inmediato y solo se libera cuando el re-render con el formulario ya
  // vacío efectivamente ocurre (ver useEffect debajo).
  const submittingRef = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify({ sort: todayOrderSort, filterUnsent, filterUnconfirmed }));
    } catch {}
  }, [todayOrderSort, filterUnsent, filterUnconfirmed]);

  useEffect(() => {
    submittingRef.current = false;
  }, [customerName]);

  const today = todayStr();
  const tomorrow = tomorrowStr();
  // Pasadas las 4pm, cualquier pedido sin enviar (de cualquier fecha) pasa a
  // contar como pedido de mañana -- mismo criterio que las pestañas Hoy/Mañana.
  // Lo mismo si el envío (marcar Enviado) pasó hoy después de las 4pm.
  const pastCutoffTime = isPastCutoffNow();
  const belongsToTomorrow = (o) =>
    o.date === tomorrow || (pastCutoffTime && !o.sent) || wasSentAfterCutoffToday(o.sentAt);
  const belongsToToday = (o) => o.date === today && !belongsToTomorrow(o);
  const allOrders = groupAllOrders(movements);
  const searchTerm = orderSearch.trim().toLowerCase();
  const matchesSearch = (order) => !searchTerm || order.customerName.toLowerCase().includes(searchTerm);
  const matchesStatusFilter = (order) =>
    (!filterUnsent && !filterUnconfirmed) ||
    (filterUnsent && !order.sent) ||
    (filterUnconfirmed && !order.confirmed);
  const matchesFilters = (order) => matchesSearch(order) && matchesStatusFilter(order);
  const todaysOrders = allOrders.filter((o) => belongsToToday(o) && matchesFilters(o));
  const sortedTodaysOrders = [...todaysOrders].sort((a, b) =>
    todayOrderSort === "recent" ? b.timestamp.localeCompare(a.timestamp) : a.timestamp.localeCompare(b.timestamp)
  );
  const tomorrowsOrders = allOrders.filter((o) => belongsToTomorrow(o) && matchesFilters(o));
  const sortedTomorrowsOrders = [...tomorrowsOrders].sort((a, b) =>
    todayOrderSort === "recent" ? b.timestamp.localeCompare(a.timestamp) : a.timestamp.localeCompare(b.timestamp)
  );
  const pastCutoff = getDateNDaysAgoStr(PAST_ORDERS_DAYS, today);
  const pastOrdersByDate = new Map();
  allOrders
    .filter((o) => !belongsToToday(o) && !belongsToTomorrow(o) && o.date >= pastCutoff && matchesFilters(o))
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
    setNote("");
    setDraftLines([]);
    setPendingQty("");
    setEditingOrderId(null);
    setBigOrderWarning(null);
  }

  function startEdit(order) {
    setCustomerName(order.customerName);
    setIsDelivery(order.isDelivery);
    setNote(order.note || "");
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
    if (submittingRef.current) return;
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
    const draft = { customerName: customerName.trim(), isDelivery, note: note.trim(), lines };
    const bigLines = lines
      .map((l) => {
        const product = products.find((p) => p.code === l.code);
        const threshold = product ? lowStockThresholdFor(product) : null;
        return { name: product ? product.name : l.code, qty: l.qty, threshold };
      })
      .filter((x) => x.threshold != null && x.qty > x.threshold);
    if (bigLines.length > 0) {
      setBigOrderWarning({ draft, bigLines });
      return;
    }
    submittingRef.current = true;
    submitDraft(draft);
  }

  function submitDraft(draft) {
    if (editingOrderId) {
      onEditOrder(editingOrderId, draft);
    } else {
      onConfirmOrder(draft);
    }
    resetForm();
  }

  function confirmBigOrderAnyway() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    submitDraft(bigOrderWarning.draft);
    setBigOrderWarning(null);
  }

  function cancelBigOrderWarning() {
    setBigOrderWarning(null);
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

  function negativeStockLines(order) {
    return order.lines
      .map((l) => {
        const product = products.find((p) => p.code === l.code);
        return { name: product ? product.name : l.code, stockNow: stock[l.code] || 0 };
      })
      .filter((x) => x.stockNow < 0);
  }

  function handlePostponeClick(order) {
    const negatives = negativeStockLines(order);
    if (negatives.length > 0) {
      setPostponeWarning({ orderId: order.orderId, negatives });
      return;
    }
    onPostponeOrder(order.orderId);
  }

  function forcePostpone() {
    onPostponeOrder(postponeWarning.orderId);
    setPostponeWarning(null);
  }

  function cancelPostponeWarning() {
    setPostponeWarning(null);
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
            {order.note && (
              <div style={{ color: "#8A5A1E", fontSize: 12.5, marginTop: 4, fontStyle: "italic" }}>
                📝 {order.note}
              </div>
            )}
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
                onClick={() => handlePostponeClick(order)}
                title="Aplazar pedido (a hoy/mañana)"
                aria-label="Aplazar pedido"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "transparent", border: "1px solid #E7E2D3", color: "#8A8574",
                  borderRadius: 7, width: 40, height: 40, cursor: "pointer", flexShrink: 0,
                }}
              >
                <CalendarClock size={16} />
              </button>
              <button
                onClick={() => startEdit(order)}
                title="Editar pedido"
                aria-label="Editar pedido"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "transparent", border: "1px solid #E7E2D3", color: "#8A8574",
                  borderRadius: 7, width: 40, height: 40, cursor: "pointer", flexShrink: 0,
                }}
              >
                <Pencil size={16} />
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
                  borderRadius: 7, width: 40, height: 40, cursor: "pointer", flexShrink: 0,
                }}
              >
                <Send size={16} />
              </button>
              <button
                onClick={() => handleDeleteClick(order.orderId)}
                title={confirmingDeleteId === order.orderId ? "Confirmar eliminación" : "Eliminar pedido"}
                aria-label={confirmingDeleteId === order.orderId ? "Confirmar eliminación" : "Eliminar pedido"}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  gap: 4, width: confirmingDeleteId === order.orderId ? "auto" : 40, height: 40,
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

        {postponeWarning && postponeWarning.orderId === order.orderId && (
          <div style={{ marginTop: 10, padding: "10px", background: "#FBFAF6", border: "1px solid #E7E2D3", borderRadius: 8 }}>
            <div style={{ fontSize: 12.5, color: "#8A5A1E", fontWeight: 600, marginBottom: 6 }}>
              ⚠️ Stock negativo en:
            </div>
            <div style={{ fontSize: 12.5, color: "#8A5A1E", marginBottom: 10 }}>
              {postponeWarning.negatives.map((n) => `${n.name} (${n.stockNow})`).join(", ")}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={forcePostpone}
                style={{
                  background: "#B4291E", color: "#FFFFFF", border: "none", borderRadius: 7,
                  padding: "7px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                }}
              >
                Aplazar de todos modos
              </button>
              <button
                onClick={cancelPostponeWarning}
                style={{
                  background: "transparent", color: "#8A8574", border: "1px solid #E7E2D3", borderRadius: 7,
                  padding: "7px 12px", fontSize: 12.5, cursor: "pointer",
                }}
              >
                Cancelar
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

        <textarea
          placeholder="Nota (opcional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          style={{
            width: "100%", border: "1px solid #E7E2D3", borderRadius: 7,
            padding: "9px 12px", fontSize: 14, boxSizing: "border-box",
            marginBottom: 14, resize: "vertical", fontFamily: "inherit",
          }}
        />

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

        {bigOrderWarning && (
          <div style={{ marginTop: 12, padding: "10px", background: "#FBEFE0", border: "1px solid #E9CFA0", borderRadius: 8 }}>
            <div style={{ fontSize: 12.5, color: "#8A5A1E", fontWeight: 600, marginBottom: 6 }}>
              ⚠️ Pedido grande:
            </div>
            <div style={{ fontSize: 12.5, color: "#8A5A1E", marginBottom: 10 }}>
              {bigOrderWarning.bigLines.map((l) => `${l.name}: ${l.qty} uds (aviso ≤ ${l.threshold})`).join(", ")}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={confirmBigOrderAnyway}
                style={{
                  background: "#22261F", color: "#F7F4EC", border: "none", borderRadius: 7,
                  padding: "7px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                }}
              >
                Confirmar de todas formas
              </button>
              <button
                onClick={cancelBigOrderWarning}
                style={{
                  background: "transparent", color: "#8A8574", border: "1px solid #E7E2D3", borderRadius: 7,
                  padding: "7px 12px", fontSize: 12.5, cursor: "pointer",
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
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
          padding: "9px 12px", fontSize: 14, boxSizing: "border-box", marginBottom: 10,
        }}
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 14 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#8A8574", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={filterUnsent}
            onChange={(e) => setFilterUnsent(e.target.checked)}
          />
          Solo no enviados
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#8A8574", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={filterUnconfirmed}
            onChange={(e) => setFilterUnconfirmed(e.target.checked)}
          />
          Solo no confirmados
        </label>
      </div>

      {(() => {
        const hoySection = (
          <div>
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
                {searchTerm || filterUnsent || filterUnconfirmed
                  ? "Ningún pedido de hoy coincide con la búsqueda/filtros."
                  : "Aún no hay pedidos hoy."}
              </div>
            ) : (
              <div style={{ background: "#FFFFFF", border: "1px solid #E7E2D3", borderRadius: 12, overflow: "hidden" }}>
                {sortedTodaysOrders.map((order, i) => renderOrderRow(order, i, { inSelectMode: selectMode }))}
              </div>
            )}
          </div>
        );

        const mananaSection = tomorrowsOrders.length > 0 && (
          <div>
            <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "#8A8574", fontWeight: 600, marginBottom: 10 }}>
              PEDIDOS DE MAÑANA
            </div>
            <div style={{ background: "#FFFFFF", border: "1px solid #E7E2D3", borderRadius: 12, overflow: "hidden" }}>
              {sortedTomorrowsOrders.map((order, i) => renderOrderRow(order, i, { inSelectMode: false }))}
            </div>
          </div>
        );

        return pastCutoffTime ? (
          <>
            {mananaSection && <div style={{ marginBottom: 20 }}>{mananaSection}</div>}
            {hoySection}
          </>
        ) : (
          <>
            {hoySection}
            {mananaSection && <div style={{ marginTop: 20 }}>{mananaSection}</div>}
          </>
        );
      })()}

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
