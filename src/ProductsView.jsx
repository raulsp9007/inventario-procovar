import { useMemo, useState, useEffect, useRef } from "react";
import { Settings2, Trash2, History, ChevronDown, ChevronUp, GripVertical, ReceiptText, X, EyeOff, Eye } from "lucide-react";
import { formatDate, formatDateTime } from "./dateUtils";
import { formatCUP, formatUSD, priceToCUP } from "./money";
import FieldLabel from "./FieldLabel.jsx";
import Card from "./Card.jsx";
import { groupAllOrders, reservedForTomorrow } from "./orderHelpers.js";

export default function ProductsView({
  products,
  activeProducts,
  archivedProducts,
  stock,
  prices,
  movements,
  lastAdjustedAt,
  showPrices,
  exchangeRate,
  onExchangeRateChange,
  lowStockThresholdFor,
  defaultLowStockThreshold,
  editMode,
  onToggleEditMode,
  editInputs,
  setEditInputs,
  editPriceInputs,
  setEditPriceInputs,
  editNameInputs,
  setEditNameInputs,
  editHlInputs,
  setEditHlInputs,
  editLowStockInputs,
  setEditLowStockInputs,
  editReserveInputs,
  setEditReserveInputs,
  editColorInputs,
  setEditColorInputs,
  newProductName,
  setNewProductName,
  newProductHl,
  setNewProductHl,
  onAddProduct,
  onArchiveProduct,
  onRestoreProduct,
  onMoveProduct,
  onReorderProducts,
  showArchived,
  setShowArchived,
  onRegisterManualSale,
}) {
  const allOrders = useMemo(() => groupAllOrders(movements), [movements]);
  const [manualSaleCode, setManualSaleCode] = useState(null);
  const [manualSaleQty, setManualSaleQty] = useState("");
  const [rateInput, setRateInput] = useState(() => (exchangeRate != null ? String(exchangeRate) : ""));
  // Ajustador rápido de existencias (modo edición): un número que se suma o
  // resta al stock que ya está en editInputs, en vez de tener que calcular
  // a mano el nuevo total y tipearlo entero. No toca nada hasta "Guardar
  // existencias" -- solo empuja el resultado a editInputs, como si lo
  // hubieras tipeado vos.
  const [deltaInputs, setDeltaInputs] = useState({});
  // Solo se aplica fuera de modo edición -- si estás ajustando existencias
  // querés ver justo los productos en 0 para reponerlos, no que desaparezcan.
  // Se basa en `stock` (existencia real) nunca en "Libre": una reserva o un
  // pedido para mañana sin enviar todavía no tocan `stock`, así que un
  // producto con ventas pendientes que dejarían el disponible en 0 sigue
  // apareciendo hasta que esa venta se confirme de verdad.
  // Persiste entre pestañas y recargas -- queda activo hasta que se
  // desactive a mano (esta vista se desmonta al cambiar de pestaña, si no
  // se guardara se perdería cada vez).
  const [hideZeroStock, setHideZeroStock] = useState(() => {
    try {
      return localStorage.getItem("procovar-ocultar-productos-cero") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("procovar-ocultar-productos-cero", hideZeroStock ? "1" : "0");
    } catch {}
  }, [hideZeroStock]);
  const [showHistory, setShowHistory] = useState(false);
  // Arrastrar y soltar para reordenar -- a mano con pointer events, sin
  // dependencia nueva ni HTML5 drag nativo (ese no anda en touch, y esto es
  // una app mobile-first). La fuente de verdad es dragStateRef (un ref, no
  // React state): con eventos de puntero rápidos seguidos (como dispara un
  // drag automatizado, o simplemente arrastrar rápido), React 18 puede
  // agrupar varios pointermove + el pointerup final en un solo batch, y
  // handleDragEnd terminaba leyendo un dragOrder de un render viejo (el de
  // antes del batch) en vez del último calculado -- el ref siempre está al
  // día porque se escribe de inmediato, sin pasar por el ciclo de render.
  // draggingCode/dragOrder en React state son solo para pintar (opacidad de
  // la fila, orden visual mientras se arrastra); el commit final siempre
  // sale del ref.
  const dragStateRef = useRef({ code: null, order: null });
  const [draggingCode, setDraggingCode] = useState(null);
  const [dragOrder, setDragOrder] = useState(null);

  function handleDragStart(e, code) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const order = activeProducts.map((p) => p.code);
    dragStateRef.current = { code, order };
    setDraggingCode(code);
    setDragOrder(order);
  }

  function handleDragMove(e) {
    const st = dragStateRef.current;
    if (!st.code) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const row = el?.closest("[data-product-code]");
    const overCode = row?.getAttribute("data-product-code");
    if (!overCode || overCode === st.code) return;
    const from = st.order.indexOf(st.code);
    const to = st.order.indexOf(overCode);
    if (from === -1 || to === -1 || from === to) return;
    const next = [...st.order];
    next.splice(from, 1);
    next.splice(to, 0, st.code);
    dragStateRef.current = { code: st.code, order: next };
    setDragOrder(next);
  }

  function handleDragEnd() {
    const st = dragStateRef.current;
    if (st.code && st.order) onReorderProducts(st.order);
    dragStateRef.current = { code: null, order: null };
    setDraggingCode(null);
    setDragOrder(null);
  }
  const zeroStockCount = activeProducts.filter((p) => (stock[p.code] || 0) === 0).length;
  const visibleProducts = !editMode && hideZeroStock
    ? activeProducts.filter((p) => (stock[p.code] || 0) > 0)
    : activeProducts;
  // El arrastre también vale en la vista simple, no solo en modo edición --
  // dragOrder siempre es una permutación de TODOS los activos (hacen falta
  // todos para reorderActiveProducts), así que acá se filtra de nuevo por
  // "ocultar en 0" para no mostrar durante el arrastre algo que la vista
  // simple ya tenía escondido.
  const displayedProducts = dragOrder
    ? dragOrder
        .map((code) => activeProducts.find((p) => p.code === code))
        .filter((p) => p && (editMode || !hideZeroStock || (stock[p.code] || 0) > 0))
    : visibleProducts;

  function applyDelta(code, sign) {
    const delta = parseInt(deltaInputs[code], 10);
    if (!deltaInputs[code] || isNaN(delta) || delta <= 0) return;
    const current = parseInt(editInputs[code], 10) || 0;
    const next = Math.max(0, current + sign * delta);
    setEditInputs((s) => ({ ...s, [code]: String(next) }));
    setDeltaInputs((s) => ({ ...s, [code]: "" }));
  }

  function closeManualSale() {
    setManualSaleCode(null);
    setManualSaleQty("");
  }

  function submitManualSale(code, sign) {
    const qty = parseInt(manualSaleQty, 10);
    if (!manualSaleQty || isNaN(qty) || qty <= 0) return;
    onRegisterManualSale(code, sign * qty);
    closeManualSale();
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "var(--text-muted)", fontWeight: 600 }}>PRODUCTOS</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <label style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 5 }}>
            1$ =
            <input
              type="number"
              inputMode="decimal"
              value={rateInput}
              onChange={(e) => {
                const raw = e.target.value;
                setRateInput(raw);
                const val = parseFloat(raw);
                onExchangeRateChange(isNaN(val) || val <= 0 ? null : val);
              }}
              placeholder="tasa"
              title="Tasa de cambio: 1 USD en CUP"
              style={{
                width: 56, border: "1px solid var(--border)", borderRadius: 7, background: "var(--surface)", color: "var(--text)",
                padding: "6px 6px", fontSize: 12.5, fontVariantNumeric: "tabular-nums", textAlign: "center",
              }}
            />
            CUP
          </label>
          <button
            onClick={onToggleEditMode}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: editMode ? "var(--ink)" : "transparent",
              color: editMode ? "var(--cream)" : "var(--text)",
              border: "1px solid var(--text)",
              borderRadius: 7, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            <Settings2 size={14} />
            {editMode ? "Guardar existencias" : "Ajustar"}
          </button>
        </div>
      </div>

      {!editMode && (zeroStockCount > 0 || hideZeroStock) && (
        <button
          onClick={() => setHideZeroStock((s) => !s)}
          style={{
            display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none",
            color: "var(--text-muted)", fontSize: 12.5, padding: 0, marginBottom: 12, cursor: "pointer",
          }}
        >
          {hideZeroStock ? <Eye size={14} /> : <EyeOff size={14} />}
          {hideZeroStock ? `Mostrar productos en 0 (${zeroStockCount})` : `Ocultar productos en 0 (${zeroStockCount})`}
        </button>
      )}

      {visibleProducts.length === 0 && activeProducts.length > 0 && (
        <div style={{ fontSize: 13.5, color: "var(--text-faint)", padding: "10px 2px" }}>
          Todos los productos están en 0.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 10 }}>
        {displayedProducts.map((p) => {
          const qty = stock[p.code] || 0;
          const isLow = qty <= lowStockThresholdFor(p);
          const lastMovement = movements.find((m) => m.code === p.code);
          return (
            <div
              key={p.code}
              data-product-code={p.code}
              className="rowfade"
              style={{
                background: "var(--surface)",
                border: `1px solid ${isLow ? "var(--border-warn)" : "var(--border)"}`,
                borderRadius: 12,
                padding: editMode ? "16px 18px" : "10px 14px",
                opacity: draggingCode === p.code ? 0.45 : 1,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: editMode ? "flex-start" : "center", flexWrap: "wrap", gap: 12 }}>
                <div style={{ display: "flex", gap: editMode ? 12 : 10, alignItems: editMode ? "flex-start" : "center", flex: "1 1 200px", minWidth: 0 }}>
                  {editMode ? (
                    <input
                      type="color"
                      value={editColorInputs[p.code] ?? p.color}
                      onChange={(e) => setEditColorInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                      title="Color del producto"
                      style={{
                        width: 40, height: 40, borderRadius: 8, border: "1px solid var(--border-strong)",
                        padding: 2, cursor: "pointer", flexShrink: 0, background: "var(--surface)",
                      }}
                    />
                  ) : (
                    <div style={{
                      width: 5, height: 30, borderRadius: 3, background: p.color, flexShrink: 0,
                    }} />
                  )}
                  <div style={{ minWidth: 0 }}>
                    {editMode ? (
                      <input
                        type="text"
                        value={editNameInputs[p.code] ?? p.name}
                        onChange={(e) => setEditNameInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                        style={{
                          fontWeight: 700, fontSize: 15.5, border: "1px solid var(--border-strong)", borderRadius: 7,
                          padding: "4px 8px", marginBottom: 2, width: "100%", boxSizing: "border-box",
                        }}
                      />
                    ) : (
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{p.name}</div>
                    )}
                    {editMode && (
                      <>
                        <div style={{ fontSize: 12, color: "var(--text-faint)" }}>{p.short}{lastMovement ? ` · último movimiento ${formatDate(lastMovement.date)}` : ""}</div>
                        {lastAdjustedAt[p.code] && (
                          <div style={{ fontSize: 11, color: "var(--text-faint-2)" }}>ajustado {formatDateTime(lastAdjustedAt[p.code])}</div>
                        )}
                      </>
                    )}
                    {!editMode && showPrices && (
                      prices[p.code] ? (
                        exchangeRate ? (
                          <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--accent-green-text)" }}>
                            {formatUSD(prices[p.code])}{" "}
                            <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>· {formatCUP(priceToCUP(prices[p.code], exchangeRate))}</span>
                          </div>
                        ) : (
                          <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--accent-green-text)" }}>
                            {formatCUP(prices[p.code])}
                          </div>
                        )
                      ) : (
                        <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--accent-green-text)" }}>
                          Precio no definido
                        </div>
                      )
                    )}
                    {!editMode && (reservedForTomorrow(allOrders, p.code) > 0 || (p.reserveQty || 0) > 0) && (
                      <div style={{ fontSize: 10.5, color: "var(--accent-orange-soft-text)" }}>
                        {reservedForTomorrow(allOrders, p.code) > 0 && `Reservado (mañana): ${reservedForTomorrow(allOrders, p.code)} · `}
                        {(p.reserveQty || 0) > 0 && `En reserva: ${p.reserveQty} · `}
                        Libre: {Math.max(0, qty - reservedForTomorrow(allOrders, p.code) - (p.reserveQty || 0))}
                      </div>
                    )}
                  </div>
                </div>

                {!editMode && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: isLow ? "var(--accent-orange-text)" : "var(--text)" }}>
                      {qty} <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-faint)" }}>uds</span>
                    </div>
                    <button
                      onClick={() => { setManualSaleCode(manualSaleCode === p.code ? null : p.code); setManualSaleQty(""); }}
                      title="Venta manual"
                      aria-label="Venta manual"
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                        background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)", cursor: "pointer",
                      }}
                    >
                      <ReceiptText size={13} />
                    </button>
                    <button
                      onPointerDown={(e) => handleDragStart(e, p.code)}
                      onPointerMove={handleDragMove}
                      onPointerUp={handleDragEnd}
                      onPointerCancel={handleDragEnd}
                      onLostPointerCapture={handleDragEnd}
                      title="Arrastrar para reordenar"
                      aria-label="Arrastrar para reordenar"
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: 26, height: 26, borderRadius: 8, flexShrink: 0, cursor: "grab", touchAction: "none",
                        background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)",
                      }}
                    >
                      <GripVertical size={14} />
                    </button>
                  </div>
                )}

                {editMode && (
                  <button
                    onPointerDown={(e) => handleDragStart(e, p.code)}
                    onPointerMove={handleDragMove}
                    onPointerUp={handleDragEnd}
                    onPointerCancel={handleDragEnd}
                    title="Arrastrar para reordenar"
                    aria-label="Arrastrar para reordenar"
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                      background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)",
                      cursor: "grab", touchAction: "none",
                    }}
                  >
                    <GripVertical size={16} />
                  </button>
                )}
              </div>

              {!editMode && manualSaleCode === p.code && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 10 }}>
                    <input
                      type="number"
                      inputMode="numeric"
                      autoFocus
                      placeholder="Uds"
                      value={manualSaleQty}
                      onChange={(e) => setManualSaleQty(e.target.value)}
                      style={{
                        width: 70, textAlign: "right", border: "1px solid var(--border)", borderRadius: 7,
                        padding: "7px 8px", fontSize: 14, fontVariantNumeric: "tabular-nums",
                      }}
                    />
                    <button
                      onClick={() => submitManualSale(p.code, 1)}
                      title="Registrar venta (resta stock, suma a vendido hoy e ingreso)"
                      style={{
                        background: "var(--ink)", color: "var(--cream)", border: "none",
                        borderRadius: 7, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      Vender
                    </button>
                    <button
                      onClick={() => submitManualSale(p.code, -1)}
                      title="Corregir (una venta contada de más: devuelve stock, resta ingreso)"
                      style={{
                        background: "transparent", color: "var(--warning-text)", border: "1px solid var(--border)",
                        borderRadius: 7, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      Corregir
                    </button>
                    <button
                      onClick={closeManualSale}
                      title="Cancelar"
                      aria-label="Cancelar"
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: "transparent", color: "var(--text-muted)", border: "none",
                        borderRadius: 7, width: 30, height: 30, cursor: "pointer", flexShrink: 0,
                      }}
                    >
                      <X size={16} />
                    </button>
                </div>
              )}

              {editMode && (
                <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                  <div style={{ flex: "3 1 0", minWidth: 0 }}>
                    <FieldLabel>STOCK ACTUAL</FieldLabel>
                    <div style={{ display: "flex", gap: 3, minWidth: 0 }}>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={editInputs[p.code]}
                        onChange={(e) => setEditInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                        style={{
                          flex: "1 1 0", minWidth: 0, boxSizing: "border-box", fontSize: 15, fontWeight: 700,
                          border: "1px solid var(--border-strong)", borderRadius: 7, padding: "6px 8px",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      />
                      <input
                        type="number"
                        inputMode="numeric"
                        value={deltaInputs[p.code] ?? ""}
                        onChange={(e) => setDeltaInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                        placeholder="cant."
                        title="Cantidad a sumar o restar del stock de arriba"
                        style={{
                          width: 40, minWidth: 0, flexShrink: 0, boxSizing: "border-box", fontSize: 11, textAlign: "center",
                          border: "1px solid var(--border)", borderRadius: 6, padding: "4px 2px",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => applyDelta(p.code, -1)}
                        title="Restar del stock actual"
                        aria-label="Restar del stock actual"
                        style={{
                          flexShrink: 0, width: 22, background: "transparent", border: "1px solid var(--border)",
                          borderRadius: 6, color: "var(--text)", fontSize: 13, fontWeight: 700, cursor: "pointer",
                        }}
                      >
                        −
                      </button>
                      <button
                        type="button"
                        onClick={() => applyDelta(p.code, 1)}
                        title="Sumar al stock actual"
                        aria-label="Sumar al stock actual"
                        style={{
                          flexShrink: 0, width: 22, background: "transparent", border: "1px solid var(--border)",
                          borderRadius: 6, color: "var(--text)", fontSize: 13, fontWeight: 700, cursor: "pointer",
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div style={{ flex: "1 1 0", minWidth: 0 }}>
                    {exchangeRate ? (
                      <>
                        <FieldLabel>PRECIO USD</FieldLabel>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={editPriceInputs[p.code] ?? ""}
                          onChange={(e) => setEditPriceInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                          title="Precio en dólares -- fijo, no cambia solo al mover la tasa"
                          style={{
                            width: "100%", boxSizing: "border-box", fontSize: 14, fontWeight: 600,
                            border: "1px solid var(--border-strong)", borderRadius: 7, padding: "8px 10px",
                            fontVariantNumeric: "tabular-nums", color: "var(--text)", background: "var(--surface)",
                          }}
                        />
                        <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 3 }}>
                          {formatCUP(priceToCUP(parseFloat(editPriceInputs[p.code]) || 0, exchangeRate))}
                        </div>
                      </>
                    ) : (
                      <>
                        <FieldLabel>PRECIO CUP</FieldLabel>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={editPriceInputs[p.code]}
                          onChange={(e) => setEditPriceInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                          title="Precio en CUP -- configurá la tasa de cambio arriba para cargarlo en USD"
                          style={{
                            width: "100%", boxSizing: "border-box", fontSize: 14, fontWeight: 600,
                            border: "1px solid var(--border-strong)", borderRadius: 7, padding: "8px 10px",
                            fontVariantNumeric: "tabular-nums", color: "var(--text)", background: "var(--surface)",
                          }}
                        />
                      </>
                    )}
                  </div>
                </div>
              )}

              {editMode && (
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "10px 12px", marginTop: 10 }}>
                  <div>
                    <FieldLabel>HL POR UNIDAD</FieldLabel>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={editHlInputs[p.code] ?? ""}
                      onChange={(e) => setEditHlInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                      title="Hectolitros por unidad"
                      style={{
                        width: "100%", boxSizing: "border-box", fontSize: 14, fontWeight: 600,
                        border: "1px solid var(--border-strong)", borderRadius: 7, padding: "8px 10px",
                        fontVariantNumeric: "tabular-nums", color: "var(--text)", background: "var(--surface)",
                      }}
                    />
                  </div>
                  <div>
                    <FieldLabel>AVISO STOCK BAJO</FieldLabel>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={editLowStockInputs[p.code] ?? ""}
                      onChange={(e) => setEditLowStockInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                      title="Cantidad de stock a partir de la cual avisar"
                      placeholder={String(defaultLowStockThreshold)}
                      style={{
                        width: "100%", boxSizing: "border-box", fontSize: 14, fontWeight: 600,
                        border: "1px solid var(--border-strong)", borderRadius: 7, padding: "8px 10px",
                        fontVariantNumeric: "tabular-nums", color: "var(--text)", background: "var(--surface)",
                      }}
                    />
                  </div>
                  <div>
                    <FieldLabel>RESERVA (opcional)</FieldLabel>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={editReserveInputs[p.code] ?? ""}
                      onChange={(e) => setEditReserveInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                      title="Unidades que se guardan aparte -- no se ofrecen en pedidos salvo que confirmes usar la reserva"
                      placeholder="0"
                      style={{
                        width: "100%", boxSizing: "border-box", fontSize: 14, fontWeight: 600,
                        border: "1px solid var(--border-strong)", borderRadius: 7, padding: "8px 10px",
                        fontVariantNumeric: "tabular-nums", color: "var(--text)", background: "var(--surface)",
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end" }}>
                    <button
                      onClick={() => onArchiveProduct(p.code)}
                      title="Eliminar producto"
                      aria-label="Eliminar producto"
                      style={{
                        display: "flex", alignItems: "center", gap: 6,
                        background: "transparent", border: "1px solid var(--border)", color: "var(--warning-text)",
                        borderRadius: 7, padding: "8px 10px", fontSize: 12, cursor: "pointer",
                      }}
                    >
                      <Trash2 size={13} /> Eliminar
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {editMode && (
          <div
            style={{
              background: "var(--surface)", border: "1px dashed var(--border-strong)", borderRadius: 12,
              padding: "14px 18px", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
            }}
          >
            <input
              type="text"
              placeholder="Nombre del producto nuevo"
              value={newProductName}
              onChange={(e) => setNewProductName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onAddProduct(); }}
              style={{
                flex: "1 1 auto", minWidth: 160, border: "1px solid var(--border)", borderRadius: 7,
                padding: "9px 12px", fontSize: 14,
              }}
            />
            <input
              type="number"
              inputMode="decimal"
              placeholder="HL/unidad"
              value={newProductHl}
              onChange={(e) => setNewProductHl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onAddProduct(); }}
              style={{
                flex: "0 1 110px", minWidth: 90, border: "1px solid var(--border)", borderRadius: 7,
                padding: "9px 12px", fontSize: 14,
              }}
            />
            <button
              onClick={onAddProduct}
              style={{
                flex: "0 0 auto", background: "var(--ink)", color: "var(--cream)", border: "none",
                borderRadius: 7, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              + Agregar producto
            </button>
          </div>
        )}
      </div>

      {editMode && archivedProducts.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <button
            onClick={() => setShowArchived((s) => !s)}
            style={{
              display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none",
              color: "var(--text-muted)", fontSize: 12, letterSpacing: "0.1em", fontWeight: 600, cursor: "pointer",
              padding: 0, marginBottom: showArchived ? 10 : 0,
            }}
          >
            {showArchived ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            PRODUCTOS ELIMINADOS ({archivedProducts.length})
          </button>

          {showArchived && (
            <Card>
              {archivedProducts.map((p, i) => (
                <div
                  key={p.code}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    gap: 8, padding: "10px 16px", fontSize: 13.5,
                    borderTop: i === 0 ? "none" : "1px solid var(--divider)",
                  }}
                >
                  <span>{p.name}</span>
                  <button
                    onClick={() => onRestoreProduct(p.code)}
                    style={{
                      background: "transparent", border: "1px solid var(--border)", color: "var(--accent-green-text)",
                      borderRadius: 7, padding: "6px 10px", fontSize: 12, cursor: "pointer",
                    }}
                  >
                    Restaurar
                  </button>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      <div style={{ marginTop: 28 }}>
        <button
          onClick={() => setShowHistory((s) => !s)}
          style={{
            display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none",
            color: "var(--text-muted)", fontSize: 12, letterSpacing: "0.1em", fontWeight: 600, cursor: "pointer",
            padding: 0, marginBottom: showHistory ? 10 : 0,
          }}
        >
          {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          <History size={14} /> HISTORIAL DE MOVIMIENTOS ({movements.length})
        </button>
        {showHistory && (movements.length === 0 ? (
          <div style={{ fontSize: 13.5, color: "var(--text-faint)", padding: "10px 2px" }}>
            Aún no hay movimientos registrados.
          </div>
        ) : (
          <Card>
            {movements.slice(0, 25).map((m, i) => {
              const product = products.find((p) => p.code === m.code);
              // Delta real de stock: una venta siempre resta (m.qty>0 normal,
              // pero una corrección manual guarda qty<0 para devolver stock,
              // por eso no se puede asumir el signo solo por el tipo).
              const delta = m.type === "venta" ? -m.qty : m.qty;
              const label = m.type === "venta"
                ? (m.manual ? (m.qty >= 0 ? "venta manual" : "corrección manual") : "venta")
                : "ajuste manual";
              return (
                <div
                  key={m.id}
                  style={{
                    display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center",
                    gap: 6, padding: "10px 16px", fontSize: 13.5,
                    borderTop: i === 0 ? "none" : "1px solid var(--divider)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: product?.color || "var(--text-faint)" }} />
                    <span style={{ fontWeight: 600 }}>{product?.short || m.code}</span>
                    <span style={{ color: "var(--text-faint)" }}>{label}</span>
                  </div>
                  <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                    <span style={{ color: "var(--text-faint)", fontSize: 12 }}>{formatDate(m.date)}</span>
                    <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: delta >= 0 ? "var(--accent-green-text)" : "var(--accent-orange-text)" }}>
                      {delta >= 0 ? `+${delta}` : delta}
                    </span>
                  </div>
                </div>
              );
            })}
          </Card>
        ))}
      </div>
    </>
  );
}
