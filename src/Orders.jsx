import { useState, useEffect, useRef, useMemo } from "react";
import { Trash2, Send, Pencil, ChevronDown, ChevronUp, CheckCheck } from "lucide-react";
import { todayStr, tomorrowStr, formatDate, formatDateTime, getDateNDaysAgoStr } from "./dateUtils";
import { formatCUP } from "./money";
import { groupAllOrders, formatOrderForWhatsApp, isCommittedOrder, reservedForTomorrow } from "./orderHelpers";
import { getCustomerNames, matchCustomerNames } from "./customerHelpers";
import Banner from "./Banner.jsx";

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

export default function Orders({ products, movements, stock, prices, showPrices, whatsappPhone, senderName, sendSenderName, lowStockThresholdFor, onConfirmOrder, onEditOrder, onDeleteOrder, onMarkSent, onMarkOrdersSent, onMarkConfirmed, onError }) {
  const senderOptions = { senderName, sendSenderName };
  const [customerName, setCustomerName] = useState("");
  const [isDelivery, setIsDelivery] = useState(false);
  const [note, setNote] = useState("");
  const [draftLines, setDraftLines] = useState([]);
  const [draftBucket, setDraftBucket] = useState("hoy");
  const [draftDate, setDraftDate] = useState(() => tomorrowStr());
  const [selectedProductCode, setSelectedProductCode] = useState("");
  const [pendingQty, setPendingQty] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectSection, setSelectSection] = useState(null); // null | "hoy" | "manana"
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [showPast, setShowPast] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);
  const [pendingDeletes, setPendingDeletes] = useState(() => new Map());
  const [bigOrderWarning, setBigOrderWarning] = useState(null);
  const [hoyOrderSort, setHoyOrderSort] = useState(() => (loadSavedFilters().sort === "oldest" ? "oldest" : "recent"));
  const [mananaOrderSort, setMananaOrderSort] = useState(() => (loadSavedFilters().sortManana === "oldest" ? "oldest" : "recent"));
  const [orderSearch, setOrderSearch] = useState("");
  const [filterUnsent, setFilterUnsent] = useState(() => !!loadSavedFilters().filterUnsent);
  const [filterUnconfirmed, setFilterUnconfirmed] = useState(() => !!loadSavedFilters().filterUnconfirmed);
  const [filterProductCode, setFilterProductCode] = useState(() => loadSavedFilters().filterProductCode || "");
  // Bloquea envíos repetidos (doble clic/doble toque) mientras el formulario
  // todavía no reflejó el reset -- el estado de React (customerName, etc.)
  // se actualiza en batch, así que un segundo click puede leer el mismo
  // formulario "todavía lleno" antes de que se limpie. El ref cambia de
  // inmediato y solo se libera cuando el re-render con el formulario ya
  // vacío efectivamente ocurre (ver useEffect debajo).
  const submittingRef = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify({ sort: hoyOrderSort, sortManana: mananaOrderSort, filterUnsent, filterUnconfirmed, filterProductCode }));
    } catch {}
  }, [hoyOrderSort, mananaOrderSort, filterUnsent, filterUnconfirmed, filterProductCode]);

  useEffect(() => {
    submittingRef.current = false;
  }, [customerName]);

  const today = todayStr();
  const belongsToToday = (o) => o.date === today;
  const isUpcoming = (o) => o.date > today;
  const searchTerm = orderSearch.trim().toLowerCase();
  const pastCutoff = getDateNDaysAgoStr(PAST_ORDERS_DAYS, today);

  // groupAllOrders + los 3 filtros/sorts escanean todos los movimientos en
  // cada uno -- se memoizan juntos para no repetir el trabajo en cada
  // render que no cambia ninguno de estos valores (ej. tipear en un input
  // que no es la búsqueda).
  const {
    allOrders, todaysOrders, sortedTodaysOrders,
    upcomingOrders, sortedUpcomingOrders,
    pastOrdersByDate, pastDatesDesc, pastOrdersCount,
  } = useMemo(() => {
    const matchesSearch = (order) => !searchTerm || order.customerName.toLowerCase().includes(searchTerm);
    const matchesStatusFilter = (order) =>
      (!filterUnsent && !filterUnconfirmed) ||
      (filterUnsent && !order.sent) ||
      (filterUnconfirmed && !order.confirmed);
    const matchesProduct = (order) => !filterProductCode || order.lines.some((l) => l.code === filterProductCode);
    const matchesFilters = (order) => matchesSearch(order) && matchesStatusFilter(order) && matchesProduct(order);

    const allOrders = groupAllOrders(movements).filter((o) => !pendingDeletes.has(o.orderId));
    const todaysOrders = allOrders.filter((o) => belongsToToday(o) && matchesFilters(o));
    const sortedTodaysOrders = [...todaysOrders].sort((a, b) =>
      hoyOrderSort === "recent" ? b.timestamp.localeCompare(a.timestamp) : a.timestamp.localeCompare(b.timestamp)
    );
    const upcomingOrders = allOrders.filter((o) => isUpcoming(o) && matchesFilters(o));
    const sortedUpcomingOrders = [...upcomingOrders].sort((a, b) =>
      mananaOrderSort === "recent" ? b.timestamp.localeCompare(a.timestamp) : a.timestamp.localeCompare(b.timestamp)
    );
    const pastOrdersByDate = new Map();
    allOrders
      .filter((o) => o.date < today && o.date >= pastCutoff && matchesFilters(o))
      .forEach((o) => {
        if (!pastOrdersByDate.has(o.date)) pastOrdersByDate.set(o.date, []);
        pastOrdersByDate.get(o.date).push(o);
      });
    const pastDatesDesc = Array.from(pastOrdersByDate.keys()).sort((a, b) => b.localeCompare(a));
    const pastOrdersCount = pastDatesDesc.reduce((sum, d) => sum + pastOrdersByDate.get(d).length, 0);

    return { allOrders, todaysOrders, sortedTodaysOrders, upcomingOrders, sortedUpcomingOrders, pastOrdersByDate, pastDatesDesc, pastOrdersCount };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movements, today, pastCutoff, searchTerm, filterUnsent, filterUnconfirmed, filterProductCode, hoyOrderSort, mananaOrderSort, pendingDeletes]);

  // Solo entra al panel si queda algo libre para prometer, o si ya tiene
  // reservas encima (aunque esté en 0 libre) -- un producto sin nada de
  // ninguna de las dos cosas solo ensucia la lista.
  const reservablePanelRows = products
    .filter((p) => !p.archived)
    .map((p) => {
      const reserved = reservedForTomorrow(allOrders, p.code);
      const libre = (stock[p.code] || 0) - reserved;
      return { product: p, reserved, libre };
    })
    .filter((row) => row.libre !== 0 || row.reserved !== 0);

  const availableProducts = products.filter((p) => !p.archived && (stock[p.code] || 0) > 0 && !draftLines.some((l) => l.code === p.code));
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
    // No se resetea draftBucket: si confirmaste un pedido Programado,
    // te quedás en "Programar" para seguir cargando pedidos del mismo tipo.
    setDraftDate(tomorrowStr());
  }

  function startEdit(order) {
    setCustomerName(order.customerName);
    setIsDelivery(order.isDelivery);
    setNote(order.note || "");
    setDraftLines(order.lines.map((l) => ({ code: l.code, qty: String(l.qty) })));
    setPendingQty("");
    setEditingOrderId(order.orderId);
    setDraftBucket(order.bucket);
    setDraftDate(order.bucket === "manana" ? order.date : tomorrowStr());
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

  // Techo real para una línea del pedido en edición/creación:
  // - Si es para Hoy: stock actual (+ lo que este mismo pedido ya tenía
  //   comprometido, si se está editando uno que ya estaba comprometido).
  // - Si es para Mañana: lo mismo, menos lo que ya reservaron OTROS pedidos
  //   de mañana sin enviar (no se puede prometer más de lo que hay físico).
  function computeAvailable(code) {
    const editingOrder = editingOrderId ? allOrders.find((o) => o.orderId === editingOrderId) : null;
    const creditBack = editingOrder && isCommittedOrder(editingOrder)
      ? (editingOrder.lines.find((l) => l.code === code)?.qty || 0)
      : 0;
    const base = (stock[code] || 0) + creditBack;
    if (draftBucket === "hoy") return base;
    return base - reservedForTomorrow(allOrders, code, editingOrderId);
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
    if (draftBucket === "manana" && (!draftDate || draftDate <= today)) {
      onError("Elegí una fecha futura para el pedido programado.");
      return;
    }
    for (const line of lines) {
      const available = computeAvailable(line.code);
      if (line.qty > available) {
        const product = products.find((p) => p.code === line.code);
        const motivo = draftBucket === "manana" ? ` para el ${formatDate(draftDate)} (ya reservado por otros pedidos)` : "";
        onError(`No hay suficiente stock de ${product ? product.name : line.code}${motivo}.`);
        return;
      }
    }
    const draft = { customerName: customerName.trim(), isDelivery, note: note.trim(), lines, bucket: draftBucket, date: draftDate };
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

  function handleDeleteClick(order) {
    if (confirmingDeleteId === order.orderId) {
      setConfirmingDeleteId(null);
      stageDelete(order);
      return;
    }
    setConfirmingDeleteId(order.orderId);
    setTimeout(() => {
      setConfirmingDeleteId((current) => (current === order.orderId ? null : current));
    }, 3000);
  }

  // Borrado real recién pasa cuando expiran los 5s sin que se apriete
  // "Deshacer" -- nada se pierde hasta ese momento, el pedido solo se
  // esconde de las listas mientras tanto (pendingDeletes). Se guarda el
  // customerName ademas del timeout para poder mostrarlo en el aviso sin
  // tener que buscarlo en una lista de la que ya lo filtramos.
  function stageDelete(order) {
    const timeoutId = setTimeout(() => {
      onDeleteOrder(order.orderId);
      setPendingDeletes((m) => {
        const next = new Map(m);
        next.delete(order.orderId);
        return next;
      });
    }, 5000);
    setPendingDeletes((m) => new Map(m).set(order.orderId, { timeoutId, customerName: order.customerName }));
  }

  function undoDelete(orderId) {
    setPendingDeletes((m) => {
      const entry = m.get(orderId);
      if (entry) clearTimeout(entry.timeoutId);
      const next = new Map(m);
      next.delete(orderId);
      return next;
    });
  }

  function toggleSelected(orderId) {
    setSelectedIds((s) => {
      const next = new Set(s);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  function startSelect(section) {
    setSelectSection(section);
    setSelectedIds(new Set());
  }

  function cancelSelect() {
    setSelectSection(null);
    setSelectedIds(new Set());
  }

  function confirmBulkSend(orders) {
    const idsToSend = [];
    orders.forEach((order) => {
      if (!selectedIds.has(order.orderId)) return;
      openOrderWhatsApp(order, products, whatsappPhone, senderOptions);
      idsToSend.push(order.orderId);
    });
    onMarkOrdersSent(idsToSend, true);
    setSelectSection(null);
    setSelectedIds(new Set());
  }

  function renderOrderRow(order, i, { inSelectMode, showDate }) {
    return (
      <div
        key={order.orderId}
        style={{
          padding: "12px 16px", fontSize: 13.5,
          borderTop: i === 0 ? "none" : "1px solid var(--divider)",
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
            <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {order.orderSeq && (
                <span style={{ color: "var(--text-faint)", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>#{order.orderSeq}</span>
              )}
              {order.isDelivery ? "🛺 " : ""}{order.customerName}
              {showDate && (
                <span style={{
                  fontSize: 11, fontWeight: 600, color: "var(--accent-orange-soft-text)",
                  border: "1px solid var(--border-warn)", borderRadius: 5, padding: "1px 6px",
                }}>
                  {formatDate(order.date)}
                </span>
              )}
            </div>
            <div style={{ color: "var(--text-faint)", fontSize: 12.5 }}>
              {order.lines.map((line) => {
                const product = products.find((p) => p.code === line.code);
                return `${line.qty}x ${product ? product.short : line.code}`;
              }).join(", ")}
              {showPrices && ` · ${formatCUP(orderTotal(order))}`}
            </div>
            <div style={{ color: "var(--text-faint-2)", fontSize: 11.5, marginTop: 2 }}>
              {formatDateTime(order.timestamp)}
            </div>
            {order.note && (
              <div style={{ color: "var(--warning-text)", fontSize: 12.5, marginTop: 4, fontStyle: "italic" }}>
                📝 {order.note}
              </div>
            )}
          </div>
        </div>

        {!inSelectMode && (
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 10 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={order.sent}
                  onChange={(e) => onMarkSent(order.orderId, e.target.checked)}
                />
                Enviado
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>
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
                  background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)",
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
                  background: "var(--whatsapp)", color: "var(--on-accent)", border: "none",
                  borderRadius: 7, width: 40, height: 40, cursor: "pointer", flexShrink: 0,
                }}
              >
                <Send size={16} />
              </button>
              <button
                onClick={() => handleDeleteClick(order)}
                title={confirmingDeleteId === order.orderId ? "Confirmar eliminación" : "Eliminar pedido"}
                aria-label={confirmingDeleteId === order.orderId ? "Confirmar eliminación" : "Eliminar pedido"}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  gap: 4, width: confirmingDeleteId === order.orderId ? "auto" : 40, height: 40,
                  padding: confirmingDeleteId === order.orderId ? "0 10px" : 0,
                  background: confirmingDeleteId === order.orderId ? "var(--danger)" : "transparent",
                  border: confirmingDeleteId === order.orderId ? "1px solid var(--danger)" : "1px solid var(--border)",
                  color: confirmingDeleteId === order.orderId ? "var(--on-accent)" : "var(--text-muted)",
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

  // Misma estructura para PEDIDOS DE HOY y PEDIDOS DE MAÑANA: título +
  // envío masivo opcional + orden + lista (o mensaje vacío). `section` es
  // "hoy" | "manana", usado para saber si el modo selección activo es el
  // de esta sección.
  function renderOrdersSection({ section, title, sorted, emptyText, sortValue, onSortChange, showDate }) {
    const inSelectMode = selectSection === section;
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "var(--text-muted)", fontWeight: 600 }}>{title}</div>
          <button
            onClick={() => (inSelectMode ? confirmBulkSend(sorted) : startSelect(section))}
            disabled={sorted.length === 0 || (inSelectMode && selectedIds.size === 0)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: (sorted.length === 0 || (inSelectMode && selectedIds.size === 0)) ? "var(--border)" : "var(--whatsapp)",
              color: (sorted.length === 0 || (inSelectMode && selectedIds.size === 0)) ? "var(--text-faint)" : "var(--on-accent)",
              border: "none", borderRadius: 7, padding: "9px 14px", fontSize: 13, fontWeight: 600,
              cursor: (sorted.length === 0 || (inSelectMode && selectedIds.size === 0)) ? "default" : "pointer",
            }}
          >
            <Send size={14} /> {inSelectMode ? `Confirmar envío (${selectedIds.size})` : "Enviar por WhatsApp"}
          </button>
        </div>

        {inSelectMode && (
          <button
            onClick={cancelSelect}
            style={{
              background: "transparent", border: "none", color: "var(--text-muted)", fontSize: 12.5,
              cursor: "pointer", padding: "0 0 10px", textDecoration: "underline",
            }}
          >
            Cancelar selección
          </button>
        )}

        {!inSelectMode && sorted.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <select
              value={sortValue}
              onChange={(e) => onSortChange(e.target.value)}
              style={{
                border: "1px solid var(--border)", borderRadius: 7,
                padding: "7px 10px", fontSize: 12.5, background: "var(--surface)", color: "var(--text-muted)",
              }}
            >
              <option value="recent">Más recientes primero</option>
              <option value="oldest">Más antiguos primero</option>
            </select>
          </div>
        )}

        {sorted.length === 0 ? (
          <div style={{ fontSize: 13.5, color: "var(--text-faint)", padding: "10px 2px" }}>
            {searchTerm || filterUnsent || filterUnconfirmed || filterProductCode ? `Ningún pedido coincide con la búsqueda/filtros.` : emptyText}
          </div>
        ) : (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            {sorted.map((order, i) => renderOrderRow(order, i, { inSelectMode, showDate }))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "var(--text-muted)", fontWeight: 600 }}>
          {editingOrderId ? "EDITAR PEDIDO" : "NUEVO PEDIDO"}
        </div>
        {editingOrderId && (
          <button
            onClick={resetForm}
            style={{
              background: "transparent", border: "none", color: "var(--text-muted)", fontSize: 12.5,
              cursor: "pointer", textDecoration: "underline",
            }}
          >
            Cancelar edición
          </button>
        )}
      </div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: draftBucket === "manana" ? 8 : 12 }}>
          <button
            onClick={() => setDraftBucket("hoy")}
            style={{
              flex: 1, padding: "9px", borderRadius: 7, border: "1px solid var(--text)", fontWeight: 600, fontSize: 13, cursor: "pointer",
              background: draftBucket === "hoy" ? "var(--ink)" : "transparent",
              color: draftBucket === "hoy" ? "var(--cream)" : "var(--text)",
            }}
          >
            Hoy
          </button>
          <button
            onClick={() => setDraftBucket("manana")}
            style={{
              flex: 1, padding: "9px", borderRadius: 7, border: "1px solid var(--text)", fontWeight: 600, fontSize: 13, cursor: "pointer",
              background: draftBucket === "manana" ? "var(--ink)" : "transparent",
              color: draftBucket === "manana" ? "var(--cream)" : "var(--text)",
            }}
          >
            Programar
          </button>
        </div>

        {draftBucket === "manana" && (
          <input
            type="date"
            value={draftDate}
            min={tomorrowStr()}
            onChange={(e) => setDraftDate(e.target.value)}
            style={{
              width: "100%", boxSizing: "border-box", border: "1px solid var(--border)", borderRadius: 7,
              padding: "9px 10px", fontSize: 14, marginBottom: 12, background: "var(--surface)", color: "var(--text)",
            }}
          />
        )}

        <div style={{ position: "relative", marginBottom: 10 }}>
          <input
            type="text"
            placeholder="Nombre y apellidos del cliente"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            style={{
              width: "100%", border: "1px solid var(--border)", borderRadius: 7,
              padding: "9px 12px", fontSize: 14, boxSizing: "border-box",
            }}
          />
          {suggestions.length > 0 && (
            <div
              style={{
                position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
                background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 7,
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

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "var(--text-muted)", marginBottom: 14, cursor: "pointer" }}>
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
            width: "100%", border: "1px solid var(--border)", borderRadius: 7,
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
                        width: 60, textAlign: "right", border: "1px solid var(--border)", borderRadius: 7,
                        padding: "6px 8px", fontSize: 14, fontVariantNumeric: "tabular-nums",
                      }}
                    />
                    <button
                      onClick={() => removeDraftLine(line.code)}
                      title="Quitar producto"
                      aria-label="Quitar producto"
                      style={{
                        background: "transparent", border: "none", color: "var(--text-muted)",
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
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <select
              value={effectiveSelectedProductCode}
              onChange={(e) => setSelectedProductCode(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box", border: "1px solid var(--border)", borderRadius: 7,
                padding: "9px 10px", fontSize: 14, background: "var(--surface)",
              }}
            >
              {availableProducts.map((p) => (
                <option key={p.code} value={p.code}>{p.name}</option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="number"
                inputMode="numeric"
                placeholder="Cant."
                value={pendingQty}
                onChange={(e) => setPendingQty(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addDraftLine(); }}
                style={{
                  flex: "1 1 auto", minWidth: 0, textAlign: "right", border: "1px solid var(--border)", borderRadius: 7,
                  padding: "9px 10px", fontSize: 14, fontVariantNumeric: "tabular-nums",
                }}
              />
              <button
                onClick={addDraftLine}
                style={{
                  flex: "0 0 auto", background: "var(--ink)", color: "var(--cream)", border: "none",
                  borderRadius: 7, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                Agregar
              </button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: "var(--text-faint)" }}>No hay productos con stock disponibles para agregar.</div>
        )}

        {bigOrderWarning && (
          <Banner
            variant="warning"
            style={{ marginTop: 12, fontSize: 12.5 }}
            actions={[
              { label: "Confirmar de todas formas", kind: "dark", onClick: confirmBigOrderAnyway },
              { label: "Cancelar", kind: "secondary", onClick: cancelBigOrderWarning },
            ]}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>⚠️ Pedido grande:</div>
            {bigOrderWarning.bigLines.map((l) => `${l.name}: ${l.qty} uds (aviso ≤ ${l.threshold})`).join(", ")}
          </Banner>
        )}

        <button
          onClick={confirmOrder}
          style={{
            marginTop: 16, width: "100%", background: "var(--ink)", color: "var(--cream)", border: "none",
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
          width: "100%", border: "1px solid var(--border)", borderRadius: 7,
          padding: "9px 12px", fontSize: 14, boxSizing: "border-box", marginBottom: 10,
        }}
      />

      <select
        value={filterProductCode}
        onChange={(e) => setFilterProductCode(e.target.value)}
        style={{
          width: "100%", boxSizing: "border-box", border: "1px solid var(--border)", borderRadius: 7,
          padding: "9px 12px", fontSize: 14, marginBottom: 10, background: "var(--surface)", color: "var(--text)",
        }}
      >
        <option value="">Todos los productos</option>
        {products.map((p) => (
          <option key={p.code} value={p.code}>{p.name}</option>
        ))}
      </select>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 14 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-muted)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={filterUnsent}
            onChange={(e) => setFilterUnsent(e.target.checked)}
          />
          Solo no enviados
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-muted)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={filterUnconfirmed}
            onChange={(e) => setFilterUnconfirmed(e.target.checked)}
          />
          Solo no confirmados
        </label>
      </div>

      {pendingDeletes.size > 0 && (
        <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
          {Array.from(pendingDeletes.entries()).map(([orderId, { customerName: deletedName }]) => (
            <Banner
              key={orderId}
              variant="dark"
              layout="row"
              style={{ fontSize: 13 }}
              actions={[{ label: "Deshacer", kind: "secondary", onClick: () => undoDelete(orderId) }]}
            >
              Pedido de {deletedName} eliminado.
            </Banner>
          ))}
        </div>
      )}

      {draftBucket === "hoy" && renderOrdersSection({
        section: "hoy",
        title: "PEDIDOS DE HOY",
        sorted: sortedTodaysOrders,
        emptyText: "Aún no hay pedidos hoy.",
        sortValue: hoyOrderSort,
        onSortChange: setHoyOrderSort,
      })}

      {draftBucket === "manana" && reservablePanelRows.length > 0 && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 11, letterSpacing: "0.1em", color: "var(--text-muted)", fontWeight: 600, marginBottom: 8 }}>
            DISPONIBLE PARA RESERVAR
          </div>
          {reservablePanelRows.map(({ product: p, reserved, libre }, i) => (
            <div
              key={p.code}
              style={{
                display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0",
                borderTop: i === 0 ? "none" : "1px solid var(--divider)",
              }}
            >
              <span>{p.name}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {reserved > 0 && <span style={{ color: "var(--accent-orange-soft-text)", marginRight: 8 }}>Reservado: {reserved}</span>}
                <b>{libre} libres</b>
              </span>
            </div>
          ))}
        </div>
      )}

      {draftBucket === "manana" && renderOrdersSection({
        section: "manana",
        title: "PRÓXIMOS PEDIDOS",
        sorted: sortedUpcomingOrders,
        emptyText: "Aún no hay pedidos programados.",
        sortValue: mananaOrderSort,
        onSortChange: setMananaOrderSort,
        showDate: true,
      })}

      {pastOrdersCount > 0 && (
        <div style={{ marginTop: 20 }}>
          <button
            onClick={() => setShowPast((s) => !s)}
            style={{
              display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none",
              color: "var(--text-muted)", fontSize: 12, letterSpacing: "0.1em", fontWeight: 600, cursor: "pointer",
              padding: 0, marginBottom: showPast ? 10 : 0,
            }}
          >
            {showPast ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            PEDIDOS ANTERIORES ({pastOrdersCount})
          </button>

          {showPast && pastDatesDesc.map((date) => (
            <div key={date} style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 6 }}>
                {formatDate(date)}
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                {pastOrdersByDate.get(date).map((order, i) => renderOrderRow(order, i, { inSelectMode: false }))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
