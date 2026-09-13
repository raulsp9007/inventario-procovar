import { useState } from "react";
import { X, Check, Info, AlertTriangle, ChevronDown } from "lucide-react";
import { tomorrowStr, formatDateShort } from "./dateUtils";
import { formatCUP, priceToCUP } from "./money";
import { productChipColors } from "./colorUtils";

// Ícono de moto (domicilio) -- no viene en lucide-react. Repetido acá en vez
// de importado de Orders.jsx para no crear una dependencia cruzada entre
// dos componentes de presentación; es un ícono chico, no vale la pena.
function MotoIcon({ size = 16, color = "currentColor", strokeWidth = 1.7 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="17.5" r="2.8" />
      <circle cx="18" cy="17.5" r="2.8" />
      <path d="M8.8 17.5h6.4M6 14.7V9h5l3.2 4.4 3.8 1.2v2.9" />
      <path d="M11 9V6h2.6" />
    </svg>
  );
}

function draftTotal(draftLines, prices, exchangeRate) {
  return draftLines.reduce((sum, l) => sum + (Number(l.qty) || 0) * priceToCUP(prices[l.code], exchangeRate), 0);
}

// Modal de crear/editar pedido -- componente de presentación pura, sin
// estado propio (salvo el colapso de la nota). Todo el estado de negocio
// (draftLines, draftBucket, etc.) y la lógica (confirmOrder, computeAvailable)
// siguen viviendo en Orders.jsx; acá solo se arma el JSX a partir de las props.
// Estructura de 3 partes -- cabecera fija (tinta) / cuerpo scrolleable
// (fondo --bg-edit) / pie fijo -- mismo "modo de trabajo" que Ajustar en
// Productos: mesa de trabajo oscurecida, una sola salida de ancho completo.
export default function OrderFormModal({
  open, onClose, editingOrderId, editingOrderSeq,
  draftBucket, onDraftBucketChange,
  draftDate, onDraftDateChange,
  customerName, onCustomerNameChange,
  businessName, onBusinessNameChange,
  customerPhone, onCustomerPhoneChange,
  showSuggestions, onShowSuggestions, suggestions, onPickSuggestion,
  nearDuplicateName, onUseNearDuplicateName,
  isDelivery, onIsDeliveryChange,
  note, onNoteChange,
  draftLines, onUpdateDraftLineQty, onRemoveDraftLine,
  showPrices, prices, exchangeRate, products,
  availableProducts, effectiveSelectedProductCode, onSelectedProductCodeChange,
  computeAvailable,
  pendingQty, onPendingQtyChange, onAddDraftLine,
  onConfirmOrder,
  pendingReserveConfirm, onConfirmUseReserve, onCancelReserveConfirm,
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  if (!open) return null;

  const total = draftTotal(draftLines, prices, exchangeRate);
  const canConfirm = customerName.trim().length > 0 && draftLines.length > 0;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(34,38,31,.55)", zIndex: 60,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 480, maxHeight: "88vh", boxSizing: "border-box",
          background: "var(--bg-edit)", borderRadius: "20px 20px 0 0",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        {/* Cabecera fija */}
        <div style={{ flexShrink: 0, background: "var(--ink)", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", color: "var(--cream)" }}>
            {editingOrderId ? "EDITAR PEDIDO" : "NUEVO PEDIDO"}
          </span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--on-ink-subtitle)", fontVariantNumeric: "tabular-nums" }}>
            {editingOrderId
              ? (editingOrderSeq ? `#${editingOrderSeq}` : "")
              : (draftLines.length > 0 ? `${draftLines.length} producto${draftLines.length === 1 ? "" : "s"}` : "")}
          </span>
          <button
            onClick={onClose}
            title="Cerrar"
            aria-label="Cerrar"
            style={{
              width: 30, height: 30, borderRadius: 8, background: "var(--ink-2)", border: "none",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
            }}
          >
            <X size={14} strokeWidth={2} color="var(--on-ink-subtitle)" />
          </button>
        </div>

        {/* Cuerpo scrolleable */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: "12px 16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ flexShrink: 0, display: "flex", gap: 4, background: "var(--segment-track)", borderRadius: 9, padding: 3 }}>
            <button
              onClick={() => onDraftBucketChange("hoy")}
              style={{
                flex: 1, height: 34, borderRadius: 7, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
                background: draftBucket === "hoy" ? "var(--ink)" : "transparent",
                color: draftBucket === "hoy" ? "var(--cream)" : "var(--muted)",
              }}
            >
              Hoy
            </button>
            <button
              onClick={() => onDraftBucketChange("manana")}
              style={{
                flex: 1, height: 34, borderRadius: 7, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
                background: draftBucket === "manana" ? "var(--ink)" : "transparent",
                color: draftBucket === "manana" ? "var(--cream)" : "var(--muted)",
              }}
            >
              Para mañana
            </button>
          </div>

          {/* Tarjeta CLIENTE */}
          <div style={{ flexShrink: 0, background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "var(--muted)" }}>CLIENTE</span>
              <span style={{ flex: 1 }} />
              {draftBucket === "manana" && (
                <div style={{ position: "relative", display: "inline-flex" }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: "var(--faint)", fontVariantNumeric: "tabular-nums" }}>
                    {formatDateShort(draftDate)}
                  </span>
                  <input
                    type="date"
                    value={draftDate}
                    min={tomorrowStr()}
                    onChange={(e) => onDraftDateChange(e.target.value)}
                    style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", border: "none" }}
                  />
                </div>
              )}
            </div>

            <div style={{ position: "relative" }}>
              <input
                type="text"
                autoFocus={!editingOrderId}
                placeholder="Nombre del cliente"
                value={customerName}
                onChange={(e) => onCustomerNameChange(e.target.value)}
                onFocus={() => onShowSuggestions(true)}
                onBlur={() => setTimeout(() => onShowSuggestions(false), 150)}
                style={{
                  width: "100%", boxSizing: "border-box", height: 42, border: "1.5px solid var(--ink)", borderRadius: 9,
                  padding: "0 12px", fontSize: 15, fontWeight: 600, color: "var(--text)", background: "var(--surface)",
                }}
              />
              {suggestions.length > 0 && (
                <div style={{
                  position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10, marginTop: 4,
                  background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden",
                  boxShadow: "0 8px 20px rgba(0,0,0,0.15)",
                }}>
                  {suggestions.map((s, i) => (
                    <button
                      key={s.name}
                      type="button"
                      onClick={() => onPickSuggestion(s.name)}
                      style={{
                        width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "11px 12px", border: "none", background: "none", cursor: "pointer",
                        borderTop: i === 0 ? "none" : "1px solid var(--hairline)",
                        fontSize: 13, color: "var(--text)", textAlign: "left",
                      }}
                    >
                      <span>{s.name}</span>
                      <span style={{ fontSize: 11, color: "var(--faint)" }}>{s.count} pedido{s.count === 1 ? "" : "s"}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => onShowSuggestions(false)}
                    style={{
                      width: "100%", textAlign: "center", padding: 9, border: "none",
                      background: "var(--surface-subtle)", fontSize: 12, color: "var(--faint)", cursor: "pointer",
                    }}
                  >
                    Cerrar
                  </button>
                </div>
              )}
            </div>

            {nearDuplicateName && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8, background: "var(--banner-bg)", border: "1px solid var(--border-warn)",
                borderRadius: 9, padding: "8px 10px",
              }}>
                <Info size={14} strokeWidth={2} color="var(--orange)" style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 500, color: "var(--orange-text)" }}>
                  ¿Es la misma que <strong>{nearDuplicateName}</strong>?
                </span>
                <button
                  onClick={onUseNearDuplicateName}
                  style={{
                    flexShrink: 0, height: 28, padding: "0 10px", borderRadius: 999, border: "none",
                    background: "var(--orange-text)", color: "var(--banner-bg)", fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Usar ese
                </button>
              </div>
            )}

            <input
              type="text"
              placeholder="Negocio · opcional"
              value={businessName}
              onChange={(e) => onBusinessNameChange(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box", height: 40, border: "1px solid var(--border)", borderRadius: 9,
                padding: "0 12px", fontSize: 14, fontWeight: 500, color: "var(--text)", background: "var(--surface-sunken)",
              }}
            />

            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0, height: 40, borderRadius: 9, border: "1px solid var(--border)", background: "var(--surface-sunken)", display: "flex", alignItems: "center", overflow: "hidden" }}>
                <span style={{ flexShrink: 0, height: "100%", display: "flex", alignItems: "center", padding: "0 10px", background: "var(--surface-subtle)", borderRight: "1px solid var(--border)", fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>
                  +53
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Teléfono"
                  value={customerPhone}
                  onChange={(e) => onCustomerPhoneChange(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", padding: "0 10px", fontSize: 14, fontWeight: 500, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}
                />
              </div>
              <button
                type="button"
                onClick={() => onIsDeliveryChange(!isDelivery)}
                title="Entrega a domicilio"
                aria-label="Entrega a domicilio"
                aria-pressed={isDelivery}
                style={{
                  flexShrink: 0, width: 96, height: 40, borderRadius: 9, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  background: isDelivery ? "var(--ink)" : "var(--surface-sunken)",
                  border: `1px solid ${isDelivery ? "var(--ink)" : "var(--border)"}`,
                }}
              >
                <span style={{
                  width: 17, height: 17, borderRadius: 5, flexShrink: 0,
                  background: isDelivery ? "var(--cream)" : "transparent",
                  border: isDelivery ? "none" : "1.5px solid var(--faintest)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {isDelivery && <Check size={11} strokeWidth={3.4} color="var(--ink)" />}
                </span>
                <MotoIcon size={16} color={isDelivery ? "var(--cream)" : "var(--muted)"} />
              </button>
            </div>

            {noteOpen ? (
              <textarea
                autoFocus
                placeholder="Nota"
                value={note}
                onChange={(e) => onNoteChange(e.target.value)}
                rows={2}
                style={{
                  width: "100%", boxSizing: "border-box", border: "1px solid var(--border)", borderRadius: 9,
                  padding: "9px 12px", fontSize: 14, resize: "vertical", fontFamily: "inherit", background: "var(--surface-sunken)", color: "var(--text)",
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setNoteOpen(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none",
                  padding: 0, cursor: "pointer", alignSelf: "flex-start",
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--muted)", lineHeight: 1 }}>+</span>
                <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--muted)" }}>Agregar nota</span>
              </button>
            )}
          </div>

          {/* EN EL PEDIDO */}
          {draftLines.length > 0 && (
            <div style={{ flexShrink: 0, background: "var(--surface)", border: "1px solid var(--ink)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ background: "var(--ink)", padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "var(--cream)" }}>EN EL PEDIDO</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--on-ink-subtitle)" }}>{draftLines.length}</span>
              </div>
              {draftLines.map((line, i) => {
                const product = products.find((p) => p.code === line.code);
                const qtyNum = parseInt(line.qty, 10) || 0;
                const available = Math.max(0, computeAvailable(line.code));
                const exceeds = qtyNum > available;
                return (
                  <div key={line.code} style={{ borderTop: i === 0 ? "none" : "1px solid var(--hairline)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px" }}>
                      <div style={{ flexShrink: 0, width: 4, height: 28, borderRadius: 2, background: product?.color || "var(--faintest)" }} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {product ? product.name : line.code}
                      </span>
                      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5 }}>
                        <button
                          type="button"
                          onClick={() => onUpdateDraftLineQty(line.code, String(Math.max(0, qtyNum - 1)))}
                          style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--surface-sunken)", color: "var(--text)", fontSize: 17, fontWeight: 600, cursor: "pointer" }}
                        >
                          −
                        </button>
                        <span style={{ minWidth: 34, textAlign: "center", fontSize: 16, fontWeight: 700, color: exceeds ? "var(--orange)" : "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                          {qtyNum}
                        </span>
                        <button
                          type="button"
                          onClick={() => onUpdateDraftLineQty(line.code, String(qtyNum + 1))}
                          style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--surface-sunken)", color: "var(--text)", fontSize: 17, fontWeight: 600, cursor: "pointer" }}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveDraftLine(line.code)}
                          title="Quitar producto"
                          aria-label="Quitar producto"
                          style={{ width: 26, height: 30, background: "transparent", border: "none", color: "var(--faintest)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        >
                          <X size={13} strokeWidth={2.2} />
                        </button>
                      </div>
                    </div>
                    {exceeds && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 12px 9px 24px" }}>
                        <AlertTriangle size={12} strokeWidth={2.2} color="var(--orange)" style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--orange)" }}>
                          Solo {available} libres · {qtyNum - available} salen de la reserva
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
              {showPrices && (
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "9px 12px", borderTop: "1px solid var(--border)", background: "var(--surface-subtle)" }}>
                  <span style={{ flex: 1, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "var(--muted)" }}>TOTAL</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
                    {formatCUP(total).replace(" CUP", "")}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 500, color: "var(--faint)" }}>CUP</span>
                </div>
              )}
            </div>
          )}

          {/* AGREGAR PRODUCTO / OTRO */}
          {availableProducts.length > 0 ? (
            <div style={{ flexShrink: 0, border: "1.5px dashed var(--border-edit)", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 9, background: "var(--surface)" }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "var(--muted)" }}>
                {draftLines.length > 0 ? "AGREGAR OTRO" : "AGREGAR PRODUCTO"}
              </span>
              <div style={{ position: "relative" }}>
                <select
                  value={effectiveSelectedProductCode}
                  onChange={(e) => onSelectedProductCodeChange(e.target.value)}
                  style={{
                    width: "100%", boxSizing: "border-box", height: 40, border: "1px solid var(--border)", borderRadius: 9,
                    padding: "0 32px 0 12px", fontSize: 14, fontWeight: 500, background: "var(--surface)", color: "var(--text)",
                    appearance: "none", WebkitAppearance: "none",
                  }}
                >
                  {availableProducts.map((p) => (
                    <option key={p.code} value={p.code}>{p.name}</option>
                  ))}
                </select>
                <ChevronDown size={14} strokeWidth={2} color="var(--muted)" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => onPendingQtyChange(String(Math.max(1, (parseInt(pendingQty, 10) || 0) - 1)))}
                  style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 9, border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text)", fontSize: 21, fontWeight: 600, cursor: "pointer" }}
                >
                  −
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="1"
                  value={pendingQty}
                  onChange={(e) => onPendingQtyChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") onAddDraftLine(); }}
                  style={{
                    flexShrink: 0, width: 48, height: 40, textAlign: "center", borderRadius: 9,
                    border: pendingQty ? "1.5px solid var(--ink)" : "1px solid var(--border-strong)",
                    background: "var(--surface)", color: "var(--text)", fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                  }}
                />
                <button
                  type="button"
                  onClick={() => onPendingQtyChange(String((parseInt(pendingQty, 10) || 0) + 1))}
                  style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 9, border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text)", fontSize: 21, fontWeight: 600, cursor: "pointer" }}
                >
                  +
                </button>
                <button
                  onClick={onAddDraftLine}
                  disabled={!effectiveSelectedProductCode || !pendingQty}
                  style={{
                    flex: 1, height: 40, borderRadius: 9, border: "none", fontSize: 13.5, fontWeight: 600,
                    cursor: effectiveSelectedProductCode && pendingQty ? "pointer" : "default",
                    background: effectiveSelectedProductCode && pendingQty ? "var(--ink)" : "var(--segment-track)",
                    color: effectiveSelectedProductCode && pendingQty ? "var(--cream)" : "var(--faint)",
                  }}
                >
                  Agregar
                </button>
              </div>

              {effectiveSelectedProductCode && (() => {
                const available = Math.max(0, computeAvailable(effectiveSelectedProductCode));
                const reserveQty = products.find((p) => p.code === effectiveSelectedProductCode)?.reserveQty || 0;
                const qtyNum = parseInt(pendingQty, 10) || 0;
                const exceedsStock = qtyNum > available;
                return exceedsStock ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <AlertTriangle size={12} strokeWidth={2.2} color="var(--orange)" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--orange)" }}>solo {available} disponibles</span>
                  </div>
                ) : (
                  <div style={{ fontSize: 11.5, fontWeight: 500, color: "var(--faint)" }}>
                    {available} disponibles{reserveQty > 0 ? ` · +${reserveQty} en reserva` : ""}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 500, color: "var(--muted)" }}>No hay productos con stock disponible.</div>
          )}
        </div>

        {/* Pie fijo */}
        <div style={{ flexShrink: 0, borderTop: "1px solid var(--border-strong)", background: "var(--bg-edit)", padding: "12px 16px 16px" }}>
            <button
              onClick={onConfirmOrder}
              disabled={!canConfirm}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", height: 48,
                borderRadius: 10, border: "none", cursor: canConfirm ? "pointer" : "default",
                background: canConfirm ? "var(--ink)" : "var(--disabled-bg)",
                color: canConfirm ? "var(--cream)" : "var(--faint)",
              }}
            >
              {canConfirm && <Check size={16} strokeWidth={2.4} />}
              <span style={{ fontSize: 14.5, fontWeight: 700 }}>{editingOrderId ? "Guardar cambios" : "Confirmar pedido"}</span>
              {canConfirm && showPrices && (
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--on-ink-subtitle)", fontVariantNumeric: "tabular-nums" }}>
                  · {formatCUP(total)}
                </span>
              )}
            </button>
        </div>
      </div>

      {pendingReserveConfirm && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed", inset: 0, background: "rgba(20,17,12,.5)", zIndex: 70,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
          }}
        >
          <div style={{ width: "100%", maxWidth: 310, background: "var(--surface)", borderRadius: 16, padding: 20, boxShadow: "0 12px 30px rgba(0,0,0,.3)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <AlertTriangle size={18} strokeWidth={2} color="var(--orange)" />
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Este pedido usará reserva</span>
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14, lineHeight: 1.4 }}>
              El stock normal no alcanza. Se tomará de la reserva manual de estos productos:
            </div>
            <div style={{ border: "1px solid var(--border-warn)", background: "var(--banner-bg)", borderRadius: 10, padding: "4px 12px", marginBottom: 16 }}>
              {pendingReserveConfirm.reserveDips.map((d, i) => (
                <div
                  key={d.code}
                  style={{
                    display: "flex", justifyContent: "space-between", padding: "9px 0",
                    borderTop: i === 0 ? "none" : "1px solid var(--border-warn)",
                  }}
                >
                  <span style={{ fontSize: 13, color: "var(--text)" }}>{d.name}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{d.fromReserve} uds</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={onCancelReserveConfirm}
                style={{
                  flex: 1, height: 44, borderRadius: 10, border: "1px solid var(--border-strong)",
                  background: "var(--surface)", color: "var(--text)", fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={onConfirmUseReserve}
                style={{
                  flex: 1, height: 44, borderRadius: 10, border: "none",
                  background: "var(--ink)", color: "var(--cream)", fontSize: 14, fontWeight: 700, cursor: "pointer",
                }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
