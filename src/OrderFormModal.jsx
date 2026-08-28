import { X } from "lucide-react";
import { tomorrowStr } from "./dateUtils";
import { formatCUP, priceToCUP } from "./money";

function draftTotal(draftLines, prices, exchangeRate) {
  return draftLines.reduce((sum, l) => sum + (Number(l.qty) || 0) * priceToCUP(prices[l.code], exchangeRate), 0);
}

// Modal de crear/editar pedido -- componente de presentación pura, sin
// estado propio. Todo el estado (draftLines, draftBucket, etc.) y la
// lógica de negocio (confirmOrder, computeAvailable) siguen viviendo en
// Orders.jsx; acá solo se arma el JSX a partir de las props.
export default function OrderFormModal({
  open, onClose, editingOrderId,
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
}) {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", boxSizing: "border-box",
          background: "var(--surface)", borderRadius: "16px 16px 0 0", padding: "16px 18px 24px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "var(--text-muted)", fontWeight: 600 }}>
            {editingOrderId ? "EDITAR PEDIDO" : "NUEVO PEDIDO"}
          </div>
          <button
            onClick={onClose}
            title="Cerrar"
            aria-label="Cerrar"
            style={{
              background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: draftBucket === "manana" ? 8 : 12 }}>
          <button
            onClick={() => onDraftBucketChange("hoy")}
            style={{
              flex: 1, padding: "9px", borderRadius: 7, border: "1px solid var(--text)", fontWeight: 600, fontSize: 13, cursor: "pointer",
              background: draftBucket === "hoy" ? "var(--ink)" : "transparent",
              color: draftBucket === "hoy" ? "var(--cream)" : "var(--text)",
            }}
          >
            Hoy
          </button>
          <button
            onClick={() => onDraftBucketChange("manana")}
            style={{
              flex: 1, padding: "9px", borderRadius: 7, border: "1px solid var(--text)", fontWeight: 600, fontSize: 13, cursor: "pointer",
              background: draftBucket === "manana" ? "var(--ink)" : "transparent",
              color: draftBucket === "manana" ? "var(--cream)" : "var(--text)",
            }}
          >
            Para mañana
          </button>
        </div>

        {draftBucket === "manana" && (
          <input
            type="date"
            value={draftDate}
            min={tomorrowStr()}
            onChange={(e) => onDraftDateChange(e.target.value)}
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
            onChange={(e) => onCustomerNameChange(e.target.value)}
            onFocus={() => onShowSuggestions(true)}
            onBlur={() => setTimeout(() => onShowSuggestions(false), 150)}
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
                  onClick={() => onPickSuggestion(name)}
                  style={{ padding: "8px 12px", fontSize: 13.5, cursor: "pointer" }}
                >
                  {name}
                </div>
              ))}
            </div>
          )}
        </div>

        {nearDuplicateName && (
          <div
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
              background: "var(--banner-warning-bg)", border: `1px solid var(--border-warn)`, borderRadius: 7,
              padding: "7px 10px", fontSize: 12.5, color: "var(--warning-text)", marginBottom: 10,
            }}
          >
            <span>¿Es el mismo cliente que <strong>{nearDuplicateName}</strong>?</span>
            <button
              onClick={onUseNearDuplicateName}
              style={{
                flexShrink: 0, background: "transparent", border: "1px solid var(--border-warn)",
                color: "var(--warning-text)", borderRadius: 6, padding: "4px 8px", fontSize: 12, cursor: "pointer",
              }}
            >
              Usar ese
            </button>
          </div>
        )}

        <input
          type="text"
          placeholder="Nombre del negocio (opcional)"
          value={businessName}
          onChange={(e) => onBusinessNameChange(e.target.value)}
          style={{
            width: "100%", border: "1px solid var(--border)", borderRadius: 7,
            padding: "9px 12px", fontSize: 14, boxSizing: "border-box", marginBottom: 10,
          }}
        />

        <input
          type="text"
          inputMode="numeric"
          placeholder="Teléfono del cliente (opcional)"
          value={customerPhone}
          onChange={(e) => onCustomerPhoneChange(e.target.value.replace(/[^\d]/g, ""))}
          style={{
            width: "100%", border: "1px solid var(--border)", borderRadius: 7,
            padding: "9px 12px", fontSize: 14, boxSizing: "border-box", marginBottom: 10,
          }}
        />

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "var(--text-muted)", marginBottom: 14, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={isDelivery}
            onChange={(e) => onIsDeliveryChange(e.target.checked)}
          />
          Entrega a domicilio
        </label>

        <textarea
          placeholder="Nota (opcional)"
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
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
                      onChange={(e) => onUpdateDraftLineQty(line.code, e.target.value)}
                      style={{
                        width: 60, textAlign: "right", border: "1px solid var(--border)", borderRadius: 7,
                        padding: "6px 8px", fontSize: 14, fontVariantNumeric: "tabular-nums",
                      }}
                    />
                    <button
                      onClick={() => onRemoveDraftLine(line.code)}
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
                Total: {formatCUP(draftTotal(draftLines, prices, exchangeRate))}
              </div>
            )}
          </div>
        )}

        {availableProducts.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <select
              value={effectiveSelectedProductCode}
              onChange={(e) => onSelectedProductCodeChange(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box", border: "1px solid var(--border)", borderRadius: 7,
                padding: "9px 10px", fontSize: 14, background: "var(--surface)",
              }}
            >
              {availableProducts.map((p) => (
                <option key={p.code} value={p.code}>{p.name}</option>
              ))}
            </select>
            {effectiveSelectedProductCode && (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                ({computeAvailable(effectiveSelectedProductCode)} disponibles)
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="number"
                inputMode="numeric"
                placeholder="Cant."
                value={pendingQty}
                onChange={(e) => onPendingQtyChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") onAddDraftLine(); }}
                style={{
                  flex: "1 1 auto", minWidth: 0, textAlign: "right", border: "1px solid var(--border)", borderRadius: 7,
                  padding: "9px 10px", fontSize: 14, fontVariantNumeric: "tabular-nums",
                }}
              />
              <button
                onClick={onAddDraftLine}
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

        <button
          onClick={onConfirmOrder}
          style={{
            marginTop: 16, width: "100%", background: "var(--ink)", color: "var(--cream)", border: "none",
            borderRadius: 7, padding: "11px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}
        >
          {editingOrderId ? "Guardar cambios" : "Confirmar pedido"}
        </button>
      </div>
    </div>
  );
}
