import { useMemo, useState, useEffect, useRef } from "react";
import { Check, Pencil, Trash2, History, ChevronDown, ChevronUp, GripVertical, ReceiptText, X, EyeOff, Eye } from "lucide-react";
import { formatDate } from "./dateUtils";
import { formatCUP, formatUSD, priceToCUP } from "./money";
import Card from "./Card.jsx";
import { groupAllOrders, reservedForTomorrow } from "./orderHelpers.js";

// Franja/agarradera de puntos (6, en 2 columnas x 3 filas) -- reemplaza el
// ícono GripVertical de lucide para calzar con el diseño exacto del
// rediseño (radios y separación propios), en vez de aproximarlo con un
// ícono genérico.
function DragDots({ color, size = 16 }) {
  return (
    <svg width={size * 0.625} height={size} viewBox="0 0 10 16" fill={color}>
      <circle cx="2.5" cy="3" r="1.3" />
      <circle cx="7.5" cy="3" r="1.3" />
      <circle cx="2.5" cy="8" r="1.3" />
      <circle cx="7.5" cy="8" r="1.3" />
      <circle cx="2.5" cy="13" r="1.3" />
      <circle cx="7.5" cy="13" r="1.3" />
    </svg>
  );
}

const STEPPER_REPEAT_START_MS = 300;
const STEPPER_REPEAT_MIN_MS = 100;
const STEPPER_REPEAT_RAMP_MS = 1000;
const DRAG_HOLD_MS = 120;

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
  onReorderProducts,
  showArchived,
  setShowArchived,
  onRegisterManualSale,
  lowStockFilterActive,
  onClearLowStockFilter,
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

  // Modo Ajustar muestra UNA sola ficha expandida a la vez (el resto queda
  // en fila compacta) -- así se ve el listado entero, se puede reordenar, y
  // no hay scroll infinito de formularios abiertos. Se reinicia a "ninguna"
  // cada vez que se entra de nuevo al modo.
  const [expandedEditCode, setExpandedEditCode] = useState(null);
  useEffect(() => {
    if (!editMode) setExpandedEditCode(null);
  }, [editMode]);

  // Contador de "cambios sin guardar" del modo Ajustar: cuenta PRODUCTOS con
  // al menos un campo modificado, no campos individuales. Se compara contra
  // una foto de los valores tal como quedaron sembrados al entrar al modo
  // (openEdit ya los llena con el valor actual) -- se toma una sola vez por
  // entrada al modo, nunca se vuelve a pisar mientras siga activo.
  const originalEditSnapshotRef = useRef(null);
  useEffect(() => {
    if (editMode) {
      originalEditSnapshotRef.current = {
        editInputs: { ...editInputs },
        editPriceInputs: { ...editPriceInputs },
        editNameInputs: { ...editNameInputs },
        editHlInputs: { ...editHlInputs },
        editLowStockInputs: { ...editLowStockInputs },
        editReserveInputs: { ...editReserveInputs },
        editColorInputs: { ...editColorInputs },
      };
    } else {
      originalEditSnapshotRef.current = null;
    }
    // Solo nos interesa el momento en que editMode cambia -- es a propósito
    // que no dependa de los inputs (si no, se re-tomaría la foto en cada
    // tecla y el contador siempre daría 0).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode]);

  function isProductChanged(code) {
    const orig = originalEditSnapshotRef.current;
    if (!orig) return false;
    return (
      (editInputs[code] ?? "") !== (orig.editInputs[code] ?? "") ||
      (editPriceInputs[code] ?? "") !== (orig.editPriceInputs[code] ?? "") ||
      (editNameInputs[code] ?? "") !== (orig.editNameInputs[code] ?? "") ||
      (editHlInputs[code] ?? "") !== (orig.editHlInputs[code] ?? "") ||
      (editLowStockInputs[code] ?? "") !== (orig.editLowStockInputs[code] ?? "") ||
      (editReserveInputs[code] ?? "") !== (orig.editReserveInputs[code] ?? "") ||
      (editColorInputs[code] ?? "") !== (orig.editColorInputs[code] ?? "")
    );
  }
  const changedCount = editMode ? activeProducts.filter((p) => isProductChanged(p.code)).length : 0;

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
  // La agarradera ya no dispara el arrastre al toque: espera ~120ms de
  // mantener presionado antes de armar el drag, para no robarle el scroll a
  // la lista con un roce accidental (la franja es angosta y vive pegada al
  // borde derecho, justo donde el pulgar apoya al scrollear).
  const pendingDragRef = useRef({ timer: null });

  function cancelPendingDrag() {
    if (pendingDragRef.current.timer) {
      clearTimeout(pendingDragRef.current.timer);
      pendingDragRef.current.timer = null;
    }
  }

  function handleHandlePointerDown(e, code) {
    const target = e.currentTarget;
    const pointerId = e.pointerId;
    cancelPendingDrag();
    pendingDragRef.current.timer = setTimeout(() => {
      pendingDragRef.current.timer = null;
      // El pointerup pudo llegar justo en el filo de los 120ms, antes de que
      // este timeout corriera pero después de que ya estuviera encolado --
      // en ese caso el puntero ya no está activo y setPointerCapture tira
      // NotFoundError. No hay drag que armar si eso pasó.
      try {
        target.setPointerCapture(pointerId);
      } catch {
        return;
      }
      const order = activeProducts.map((p) => p.code);
      dragStateRef.current = { code, order };
      setDraggingCode(code);
      setDragOrder(order);
    }, DRAG_HOLD_MS);
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
    cancelPendingDrag();
    const st = dragStateRef.current;
    if (st.code && st.order) onReorderProducts(st.order);
    dragStateRef.current = { code: null, order: null };
    setDraggingCode(null);
    setDragOrder(null);
  }

  const zeroStockCount = activeProducts.filter((p) => (stock[p.code] || 0) === 0).length;
  const lowStockFiltered = lowStockFilterActive
    ? activeProducts.filter((p) => (stock[p.code] || 0) <= lowStockThresholdFor(p))
    : activeProducts;
  const visibleProducts = !editMode && hideZeroStock
    ? lowStockFiltered.filter((p) => (stock[p.code] || 0) > 0)
    : lowStockFiltered;
  // El arrastre también vale en la vista simple, no solo en modo edición --
  // dragOrder siempre es una permutación de TODOS los activos (hacen falta
  // todos para reorderActiveProducts), así que acá se filtra de nuevo por
  // "ocultar en 0" / filtro de stock bajo para no mostrar durante el
  // arrastre algo que la vista ya tenía escondido.
  const displayedProducts = dragOrder
    ? dragOrder
        .map((code) => activeProducts.find((p) => p.code === code))
        .filter((p) => p && (editMode || !hideZeroStock || (stock[p.code] || 0) > 0))
        .filter((p) => !lowStockFilterActive || (stock[p.code] || 0) <= lowStockThresholdFor(p))
    : visibleProducts;

  function applyDeltaOnce(code, sign, clearAfter) {
    setDeltaInputs((ds) => {
      const delta = parseInt(ds[code], 10);
      if (!ds[code] || isNaN(delta) || delta <= 0) return ds;
      setEditInputs((s) => {
        const current = parseInt(s[code], 10) || 0;
        const next = Math.max(0, current + sign * delta);
        return { ...s, [code]: String(next) };
      });
      return clearAfter ? { ...ds, [code]: "" } : ds;
    });
  }

  // Stepper −/+ del bloque de stock: un toque simple aplica una vez (y
  // limpia "cant."). Mantener presionado repite cada 300ms, acelerando
  // hasta 100ms pasado 1s sostenido -- sin volver a limpiar "cant." en cada
  // repetición (si no, la segunda vuelta ya no tendría nada que aplicar),
  // recién se limpia al soltar.
  const stepperRef = useRef({ code: null, holdTimer: null, repeatTimer: null, startedAt: 0 });

  function stopStepper() {
    const st = stepperRef.current;
    if (st.holdTimer) clearTimeout(st.holdTimer);
    if (st.repeatTimer) clearTimeout(st.repeatTimer);
    if (st.code) setDeltaInputs((ds) => ({ ...ds, [st.code]: "" }));
    stepperRef.current = { code: null, holdTimer: null, repeatTimer: null, startedAt: 0 };
  }

  function startStepper(code, sign) {
    applyDeltaOnce(code, sign, false);
    const st = stepperRef.current;
    st.code = code;
    st.startedAt = Date.now();
    function scheduleNext() {
      const held = Date.now() - st.startedAt;
      const ramp = Math.min(1, held / STEPPER_REPEAT_RAMP_MS);
      const delay = STEPPER_REPEAT_START_MS - ramp * (STEPPER_REPEAT_START_MS - STEPPER_REPEAT_MIN_MS);
      st.repeatTimer = setTimeout(() => {
        applyDeltaOnce(code, sign, false);
        scheduleNext();
      }, delay);
    }
    st.holdTimer = setTimeout(scheduleNext, STEPPER_REPEAT_START_MS);
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

  const screenBg = editMode ? "var(--bg-edit)" : "transparent";

  return (
    <div style={{ background: screenBg, margin: "-20px -16px 0", padding: "0 16px 16px", transition: "background 180ms ease-out", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <div
        style={{
          position: "sticky", top: 0, zIndex: 5, background: editMode ? "var(--ink)" : "var(--bg)",
          margin: "0 -16px", padding: "20px 16px 12px", transition: "background 180ms ease-out",
        }}
      >
        {!editMode && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 15, letterSpacing: "0.1em", color: "var(--text)", fontWeight: 700 }}>PRODUCTOS</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <label style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 5, height: 32, padding: "0 9px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", boxSizing: "border-box" }}>
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
                    width: 44, border: "none", background: "transparent", color: "var(--text)",
                    padding: 0, fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums", textAlign: "center",
                  }}
                />
                CUP
              </label>
              <button
                onClick={onToggleEditMode}
                style={{
                  height: 32, padding: "0 12px", borderRadius: 8, border: "1px solid var(--text)",
                  background: "transparent", color: "var(--text)", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                }}
              >
                Ajustar
              </button>
            </div>
          </div>
        )}

        {editMode && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--ink-2)", borderRadius: 10, padding: "9px 12px" }}>
              <Pencil size={14} strokeWidth={2} color="var(--border-warn)" />
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "var(--cream)" }}>MODO AJUSTAR</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11, fontWeight: 500, color: "var(--on-ink-subtitle)" }}>
                {changedCount === 0 ? "sin cambios" : changedCount === 1 ? "1 cambio sin guardar" : `${changedCount} cambios sin guardar`}
              </span>
            </div>
            <button
              onClick={onToggleEditMode}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%",
                height: 40, borderRadius: 9, background: "var(--cream)", color: "var(--ink)", border: "none",
                fontSize: 13.5, fontWeight: 700, cursor: "pointer",
              }}
            >
              <Check size={15} strokeWidth={2} />
              Guardar existencias
            </button>
          </div>
        )}
      </div>

      <div style={{ paddingTop: 12 }}>
        {!editMode && lowStockFilterActive && (
          <div style={{ marginBottom: 10 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6, background: "var(--chip-bg)",
              border: "1px solid var(--border-warn)", borderRadius: 999, padding: "5px 10px",
              fontSize: 12.5, fontWeight: 600, color: "var(--orange-text)",
            }}>
              Filtrando: stock bajo
              <button
                onClick={onClearLowStockFilter}
                aria-label="Quitar filtro de stock bajo"
                style={{ display: "flex", background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "var(--orange-text)" }}
              >
                <X size={12} strokeWidth={2.4} />
              </button>
            </span>
          </div>
        )}

        {!editMode && (zeroStockCount > 0 || hideZeroStock) && (
          <button
            onClick={() => setHideZeroStock((s) => !s)}
            style={{
              display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none",
              color: "var(--text-muted)", fontSize: 12.5, padding: 0, marginBottom: 12, cursor: "pointer",
            }}
          >
            {hideZeroStock ? <Eye size={14} strokeWidth={1.7} /> : <EyeOff size={14} strokeWidth={1.7} />}
            {hideZeroStock ? `Mostrar productos en 0 (${zeroStockCount})` : `Ocultar productos en 0 (${zeroStockCount})`}
          </button>
        )}

        {visibleProducts.length === 0 && activeProducts.length > 0 && (
          <div style={{ fontSize: 13.5, color: "var(--text-faint)", padding: "10px 2px" }}>
            {lowStockFilterActive ? "Ningún producto en aviso de stock bajo." : "Todos los productos están en 0."}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: editMode ? 10 : 8 }}>
          {displayedProducts.map((p) => {
            const qty = stock[p.code] || 0;
            const isLow = qty <= lowStockThresholdFor(p);
            const lastMovement = movements.find((m) => m.code === p.code);
            const isDragging = draggingCode === p.code;
            const isExpanded = editMode && expandedEditCode === p.code;
            const isVentaOpen = !editMode && manualSaleCode === p.code;

            const handleDots = isDragging
              ? { bg: "var(--ink)", dots: "var(--cream)", border: "var(--hairline)" }
              : isLow
                ? { bg: "var(--warn-tint)", dots: "var(--orange-2)", border: "var(--border-warn)" }
                : { bg: "var(--surface-subtle)", dots: "var(--faintest)", border: "var(--hairline)" };

            if (editMode && !isExpanded) {
              // Fila compacta: swatch + nombre (input subrayado) + stock + agarradera.
              return (
                <div
                  key={p.code}
                  data-product-code={p.code}
                  className="rowfade"
                  onClick={() => setExpandedEditCode(p.code)}
                  style={{
                    background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 12,
                    padding: 12, display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                    opacity: isDragging ? 0.55 : 1, transform: isDragging ? "rotate(-0.6deg)" : "none",
                  }}
                >
                  <div style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 10, background: editColorInputs[p.code] ?? p.color }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {editNameInputs[p.code] ?? p.name}
                    </div>
                    <div style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 2 }}>
                      {p.code}{lastMovement ? ` · últ. mov. ${formatDate(lastMovement.date)}` : ""}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, fontSize: 26, fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em" }}>
                    {editInputs[p.code]}
                  </div>
                  <button
                    onPointerDown={(e) => { e.stopPropagation(); handleHandlePointerDown(e, p.code); }}
                    onPointerMove={handleDragMove}
                    onPointerUp={handleDragEnd}
                    onPointerCancel={handleDragEnd}
                    onLostPointerCapture={handleDragEnd}
                    onClick={(e) => e.stopPropagation()}
                    title="Arrastrar para reordenar"
                    aria-label="Arrastrar para reordenar"
                    style={{
                      flexShrink: 0, width: 36, height: 36, borderRadius: 9, background: "var(--surface-subtle)",
                      border: "none", display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "grab", touchAction: "none",
                    }}
                  >
                    <DragDots color="var(--muted)" size={18} />
                  </button>
                </div>
              );
            }

            if (editMode && isExpanded) {
              const usdMode = !!exchangeRate;
              return (
                <div
                  key={p.code}
                  data-product-code={p.code}
                  className="rowfade"
                  style={{
                    background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 12,
                    padding: 12, display: "flex", flexDirection: "column", gap: 12,
                  }}
                >
                  {/* a) Identidad */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <input
                        type="color"
                        value={editColorInputs[p.code] ?? p.color}
                        onChange={(e) => setEditColorInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                        title="Color del producto"
                        style={{
                          width: 40, height: 40, borderRadius: 10, border: "1px solid var(--border-strong)",
                          padding: 0, cursor: "pointer", background: editColorInputs[p.code] ?? p.color, appearance: "none",
                        }}
                      />
                      <div style={{
                        position: "absolute", right: -3, bottom: -3, width: 15, height: 15, borderRadius: "50%",
                        background: "var(--surface)", border: "1px solid var(--border-strong)",
                        display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none",
                      }}>
                        <ChevronDown size={8} strokeWidth={3} color="var(--text)" />
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <input
                        type="text"
                        value={editNameInputs[p.code] ?? p.name}
                        onChange={(e) => setEditNameInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                        style={{
                          width: "100%", boxSizing: "border-box", fontSize: 16, fontWeight: 600, color: "var(--text)",
                          background: "transparent", border: "none", borderBottom: "1.5px solid var(--border)",
                          padding: "0 0 5px", borderRadius: 0,
                        }}
                      />
                      <div style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 5 }}>
                        {p.code}
                        {lastMovement ? ` · últ. mov. ${formatDate(lastMovement.date)}` : ""}
                        {lastAdjustedAt[p.code] ? ` · stock ajustado ${formatDate(lastAdjustedAt[p.code].slice(0, 10))}` : ""}
                      </div>
                    </div>
                    <button
                      onPointerDown={(e) => handleHandlePointerDown(e, p.code)}
                      onPointerMove={handleDragMove}
                      onPointerUp={handleDragEnd}
                      onPointerCancel={handleDragEnd}
                      onLostPointerCapture={handleDragEnd}
                      title="Arrastrar para reordenar"
                      aria-label="Arrastrar para reordenar"
                      style={{
                        flexShrink: 0, width: 36, height: 36, borderRadius: 9, background: "var(--surface-subtle)", border: "none",
                        display: "flex", alignItems: "center", justifyContent: "center", cursor: "grab", touchAction: "none",
                      }}
                    >
                      <DragDots color="var(--muted)" size={18} />
                    </button>
                  </div>

                  {/* b) Bloque STOCK ACTUAL */}
                  <div style={{ background: "var(--surface-sunken)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "var(--muted)" }}>STOCK ACTUAL</span>
                      <span style={{ fontSize: 10.5, fontWeight: 500, color: "var(--faint)" }}>
                        antes {originalEditSnapshotRef.current?.editInputs[p.code] ?? editInputs[p.code]}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginTop: 8 }}>
                      <div style={{
                        flexShrink: 0, display: "flex", alignItems: "baseline", gap: 4, background: "var(--surface)",
                        border: "1.5px solid var(--text)", borderRadius: 9, padding: "6px 12px", boxSizing: "border-box",
                      }}>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={editInputs[p.code]}
                          onChange={(e) => setEditInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                          style={{
                            width: 64, border: "none", background: "transparent", color: "var(--text)",
                            fontSize: 34, fontWeight: 700, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums",
                            padding: 0, borderRadius: 0,
                          }}
                        />
                        <span style={{ fontSize: 11, fontWeight: 500, color: "var(--faint)" }}>uds</span>
                      </div>
                      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, height: 50 }}>
                        <button
                          type="button"
                          onPointerDown={() => startStepper(p.code, -1)}
                          onPointerUp={stopStepper}
                          onPointerLeave={stopStepper}
                          onPointerCancel={stopStepper}
                          title="Restar del stock actual"
                          aria-label="Restar del stock actual"
                          style={{
                            flexShrink: 0, width: 42, height: 42, borderRadius: 9, border: "1px solid var(--border-strong)",
                            background: "var(--surface)", color: "var(--text)", fontSize: 22, fontWeight: 600, cursor: "pointer",
                          }}
                        >
                          −
                        </button>
                        <div style={{
                          flex: 1, minWidth: 0, height: 42, borderRadius: 9, border: "1px solid var(--border-strong)",
                          background: "var(--surface)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        }}>
                          <input
                            type="number"
                            inputMode="numeric"
                            value={deltaInputs[p.code] ?? ""}
                            onChange={(e) => setDeltaInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                            title="Cantidad a sumar o restar del stock de arriba"
                            style={{
                              width: "90%", textAlign: "center", border: "none", background: "transparent", color: "var(--text)",
                              fontSize: 15, fontWeight: 600, fontVariantNumeric: "tabular-nums", padding: 0, borderRadius: 0,
                            }}
                          />
                          <span style={{ fontSize: 9, fontWeight: 500, letterSpacing: "0.08em", color: "var(--faint)", marginTop: 2 }}>CANT.</span>
                        </div>
                        <button
                          type="button"
                          onPointerDown={() => startStepper(p.code, 1)}
                          onPointerUp={stopStepper}
                          onPointerLeave={stopStepper}
                          onPointerCancel={stopStepper}
                          title="Sumar al stock actual"
                          aria-label="Sumar al stock actual"
                          style={{
                            flexShrink: 0, width: 42, height: 42, borderRadius: 9, border: "1px solid var(--border-strong)",
                            background: "var(--surface)", color: "var(--text)", fontSize: 22, fontWeight: 600, cursor: "pointer",
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* c) Lista de ajustes */}
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {usdMode ? (
                      <>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderTop: "1px solid var(--hairline)" }}>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                            Precio <span style={{ color: "var(--faint)" }}>USD</span>
                          </span>
                          <input
                            type="number"
                            inputMode="decimal"
                            value={editPriceInputs[p.code] ?? ""}
                            onChange={(e) => setEditPriceInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                            title="Precio en dólares -- fijo, no cambia solo al mover la tasa"
                            style={{
                              flexShrink: 0, width: 92, height: 34, borderRadius: 7, background: "var(--surface-sunken)",
                              border: "1px solid var(--border)", textAlign: "right", padding: "0 10px", boxSizing: "border-box",
                              fontSize: 14, fontWeight: 600, color: "var(--text)", fontVariantNumeric: "tabular-nums",
                            }}
                          />
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderTop: "1px solid var(--hairline)" }}>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                            Precio <span style={{ color: "var(--faint)" }}>CUP</span> <span style={{ fontSize: 11, color: "var(--faint)" }}>· calculado</span>
                          </span>
                          <span style={{
                            flexShrink: 0, width: 92, height: 34, display: "flex", alignItems: "center", justifyContent: "flex-end",
                            padding: "0 10px", boxSizing: "border-box", fontSize: 14, fontWeight: 600, color: "var(--green)",
                            fontVariantNumeric: "tabular-nums",
                          }}>
                            {formatCUP(priceToCUP(parseFloat(editPriceInputs[p.code]) || 0, exchangeRate))}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderTop: "1px solid var(--hairline)" }}>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                          Precio <span style={{ color: "var(--faint)" }}>CUP</span>
                        </span>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={editPriceInputs[p.code]}
                          onChange={(e) => setEditPriceInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                          title="Precio en CUP -- configurá la tasa de cambio arriba para cargarlo en USD"
                          style={{
                            flexShrink: 0, width: 92, height: 34, borderRadius: 7, background: "var(--surface-sunken)",
                            border: "1px solid var(--border)", textAlign: "right", padding: "0 10px", boxSizing: "border-box",
                            fontSize: 14, fontWeight: 600, color: "var(--text)", fontVariantNumeric: "tabular-nums",
                          }}
                        />
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderTop: "1px solid var(--hairline)" }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: "var(--text)" }}>HL por unidad</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={editHlInputs[p.code] ?? ""}
                        onChange={(e) => setEditHlInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                        title="Hectolitros por unidad"
                        style={{
                          flexShrink: 0, width: 92, height: 34, borderRadius: 7, background: "var(--surface-sunken)",
                          border: "1px solid var(--border)", textAlign: "right", padding: "0 10px", boxSizing: "border-box",
                          fontSize: 14, fontWeight: 600, color: "var(--text)", fontVariantNumeric: "tabular-nums",
                        }}
                      />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderTop: "1px solid var(--hairline)" }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: "var(--text)" }}>Aviso stock bajo</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={editLowStockInputs[p.code] ?? ""}
                        onChange={(e) => setEditLowStockInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                        title="Cantidad de stock a partir de la cual avisar"
                        placeholder={String(defaultLowStockThreshold)}
                        style={{
                          flexShrink: 0, width: 92, height: 34, borderRadius: 7, background: "var(--surface-sunken)",
                          border: "1px solid var(--border-warn)", textAlign: "right", padding: "0 10px", boxSizing: "border-box",
                          fontSize: 14, fontWeight: 600, color: "var(--orange)", fontVariantNumeric: "tabular-nums",
                        }}
                      />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderTop: "1px solid var(--hairline)" }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                        Reserva <span style={{ fontSize: 11, color: "var(--faint)" }}>· opcional</span>
                      </span>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={editReserveInputs[p.code] ?? ""}
                        onChange={(e) => setEditReserveInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                        title="Unidades que se guardan aparte -- no se ofrecen en pedidos salvo que confirmes usar la reserva"
                        placeholder="—"
                        style={{
                          flexShrink: 0, width: 92, height: 34, borderRadius: 7, background: "var(--surface-sunken)",
                          border: "1px solid var(--border)", textAlign: "right", padding: "0 10px", boxSizing: "border-box",
                          fontSize: 14, fontWeight: 500, color: "var(--text)", fontVariantNumeric: "tabular-nums",
                        }}
                      />
                    </div>
                  </div>

                  {/* d) Pie */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 10, borderTop: "1px solid var(--hairline)" }}>
                    <button
                      onClick={() => onArchiveProduct(p.code)}
                      title="Eliminar producto"
                      aria-label="Eliminar producto"
                      style={{
                        display: "flex", alignItems: "center", gap: 7, height: 34, padding: "0 12px", borderRadius: 8,
                        border: "1px solid var(--danger-border)", background: "var(--danger-bg)", color: "var(--red)",
                        fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      <Trash2 size={13} strokeWidth={1.8} /> Eliminar
                    </button>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--faint)" }}>Guarda todo con el botón de arriba</span>
                  </div>
                </div>
              );
            }

            // Vista simple.
            return (
              <div
                key={p.code}
                data-product-code={p.code}
                className="rowfade"
                style={{
                  display: "flex", alignItems: "stretch", background: "var(--surface)",
                  border: `1px solid ${isDragging ? "var(--border-strong)" : isLow ? "var(--border-warn)" : "var(--border)"}`,
                  borderRadius: 12, overflow: "hidden",
                  opacity: isDragging ? 0.55 : 1, transform: isDragging ? "rotate(-0.6deg)" : "none",
                  boxShadow: isVentaOpen ? "0 1px 0 var(--border)" : "none",
                }}
              >
                <div style={{ width: 4, flexShrink: 0, background: p.color }} />
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: isVentaOpen ? "column" : "row" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0 10px 12px", minWidth: 0 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {p.name}
                      </div>
                      {showPrices && (
                        prices[p.code] ? (
                          exchangeRate ? (
                            <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--green)", marginTop: 2, whiteSpace: "nowrap" }}>
                              {formatUSD(prices[p.code])} <span style={{ color: "var(--faintest)" }}>·</span> {formatCUP(priceToCUP(prices[p.code], exchangeRate))}
                            </div>
                          ) : (
                            <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--green)", marginTop: 2 }}>
                              {formatCUP(prices[p.code])}
                            </div>
                          )
                        ) : (
                          <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--green)", marginTop: 2 }}>
                            Precio no definido
                          </div>
                        )
                      )}
                      {(reservedForTomorrow(allOrders, p.code) > 0 || (p.reserveQty || 0) > 0) && (
                        <div style={{ fontSize: 11.5, fontWeight: 500, color: "var(--orange-2)", marginTop: 2, whiteSpace: "nowrap" }}>
                          {reservedForTomorrow(allOrders, p.code) > 0 && `Reservado (mañana): ${reservedForTomorrow(allOrders, p.code)} · `}
                          {(p.reserveQty || 0) > 0 && `En reserva: ${p.reserveQty} · `}
                          Libre: {Math.max(0, qty - reservedForTomorrow(allOrders, p.code) - (p.reserveQty || 0))}
                        </div>
                      )}
                    </div>
                    <div style={{ flexShrink: 0, display: "flex", alignItems: "baseline", gap: 3 }}>
                      <span style={{
                        fontSize: 27, fontWeight: 700, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums",
                        color: isLow ? "var(--orange)" : "var(--text)",
                      }}>
                        {qty}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 500, color: isLow ? "var(--orange-2)" : "var(--faint)" }}>uds</span>
                    </div>
                    <button
                      onClick={() => { setManualSaleCode(manualSaleCode === p.code ? null : p.code); setManualSaleQty(""); }}
                      title="Venta manual"
                      aria-label="Venta manual"
                      style={{
                        flexShrink: 0, width: 34, height: 34, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer",
                        background: isVentaOpen ? "var(--ink)" : isLow ? "var(--warn-tint)" : "var(--surface-subtle)",
                        border: `1px solid ${isVentaOpen ? "var(--ink)" : isLow ? "var(--border-warn)" : "var(--border-strong)"}`,
                        color: isVentaOpen ? "var(--cream)" : isLow ? "var(--warning-text)" : "var(--text)",
                      }}
                    >
                      <ReceiptText size={16} strokeWidth={1.7} />
                    </button>
                  </div>

                  {isVentaOpen && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 12px", borderTop: "1px dashed var(--border)", background: "var(--surface-subtle)" }}>
                      <input
                        type="number"
                        inputMode="numeric"
                        autoFocus
                        placeholder="Uds"
                        value={manualSaleQty}
                        onChange={(e) => setManualSaleQty(e.target.value)}
                        style={{
                          flexShrink: 0, width: 58, height: 36, textAlign: "center", border: "1px solid var(--border-strong)",
                          borderRadius: 8, background: "var(--surface)", color: "var(--text)", fontSize: 16, fontWeight: 600,
                          fontVariantNumeric: "tabular-nums", boxSizing: "border-box",
                        }}
                      />
                      <button
                        onClick={() => submitManualSale(p.code, 1)}
                        title="Registrar venta (resta stock, suma a vendido hoy e ingreso)"
                        style={{
                          flexShrink: 0, height: 36, padding: "0 16px", borderRadius: 8, background: "var(--ink)",
                          color: "var(--cream)", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
                        }}
                      >
                        Vender
                      </button>
                      <button
                        onClick={() => submitManualSale(p.code, -1)}
                        title="Corregir (una venta contada de más: devuelve stock, resta ingreso)"
                        style={{
                          flexShrink: 0, height: 36, padding: "0 14px", borderRadius: 8, background: "var(--surface)",
                          color: "var(--text)", border: "1px solid var(--border-strong)", fontSize: 13, fontWeight: 600, cursor: "pointer",
                        }}
                      >
                        Corregir
                      </button>
                      <span style={{ flex: 1 }} />
                      <button
                        onClick={closeManualSale}
                        title="Cancelar"
                        aria-label="Cancelar"
                        style={{
                          flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                          background: "transparent", color: "var(--muted)", border: "none",
                          borderRadius: 8, width: 30, height: 30, cursor: "pointer",
                        }}
                      >
                        <X size={14} strokeWidth={2} />
                      </button>
                    </div>
                  )}
                </div>
                <button
                  onPointerDown={(e) => handleHandlePointerDown(e, p.code)}
                  onPointerMove={handleDragMove}
                  onPointerUp={handleDragEnd}
                  onPointerCancel={handleDragEnd}
                  onLostPointerCapture={handleDragEnd}
                  title="Arrastrar para reordenar"
                  aria-label="Arrastrar para reordenar"
                  style={{
                    flexShrink: 0, width: 28, border: "none", borderLeft: `1px solid ${handleDots.border}`,
                    background: handleDots.bg, display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "grab", touchAction: "none", padding: 0,
                  }}
                >
                  <DragDots color={handleDots.dots} size={16} />
                </button>
              </div>
            );
          })}
          {editMode && (
            <div
              style={{
                border: "1.5px dashed var(--border-edit)", borderRadius: 12, padding: 12,
                display: "flex", flexDirection: "column", gap: 9, background: "var(--surface)",
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "var(--muted)" }}>AGREGAR PRODUCTO</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  placeholder="Nombre"
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") onAddProduct(); }}
                  style={{
                    flex: 1, minWidth: 0, height: 36, boxSizing: "border-box", border: "1px solid var(--border)",
                    borderRadius: 8, background: "var(--surface)", padding: "0 10px", fontSize: 13,
                  }}
                />
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="HL/ud"
                  value={newProductHl}
                  onChange={(e) => setNewProductHl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") onAddProduct(); }}
                  style={{
                    flexShrink: 0, width: 74, height: 36, boxSizing: "border-box", border: "1px solid var(--border)",
                    borderRadius: 8, background: "var(--surface)", padding: "0 10px", fontSize: 13,
                  }}
                />
                <button
                  onClick={onAddProduct}
                  aria-label="Agregar producto"
                  style={{
                    flexShrink: 0, width: 40, height: 36, borderRadius: 8, background: "var(--ink)", border: "none",
                    color: "var(--cream)", fontSize: 18, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  +
                </button>
              </div>
            </div>
          )}
        </div>

        {editMode && archivedProducts.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <button
              onClick={() => setShowArchived((s) => !s)}
              style={{
                display: "flex", alignItems: "center", gap: 6, width: "100%", background: "var(--surface)",
                border: "1px solid var(--border-edit)", borderRadius: 12, cursor: "pointer",
                padding: "11px 12px", marginBottom: showArchived ? 10 : 0,
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "var(--muted)" }}>
                PRODUCTOS ELIMINADOS ({archivedProducts.length})
              </span>
              <span style={{ flex: 1 }} />
              {showArchived ? <ChevronUp size={14} strokeWidth={2} color="var(--muted)" /> : <ChevronDown size={14} strokeWidth={2} color="var(--muted)" />}
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
                        height: 34, background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)",
                        borderRadius: 8, padding: "0 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
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
                      display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                      borderTop: i === 0 ? "none" : "1px solid var(--hairline)", fontSize: 13.5,
                    }}
                  >
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: product?.color || "var(--text-faint)", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {product?.short || m.code}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 500, color: "var(--faint)" }}>{label} · {formatDate(m.date)}</div>
                    </div>
                    <span style={{ flexShrink: 0, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: delta >= 0 ? "var(--green)" : "var(--orange)" }}>
                      {delta >= 0 ? `+${delta}` : delta}
                    </span>
                  </div>
                );
              })}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
