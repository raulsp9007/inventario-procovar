import { Settings2, Trash2, History, ChevronDown, ChevronUp, ArrowUp, ArrowDown } from "lucide-react";
import { formatDate, formatDateTime } from "./dateUtils";
import { formatCUP } from "./money";
import FieldLabel from "./FieldLabel.jsx";
import IconButton from "./IconButton.jsx";
import Card from "./Card.jsx";

export default function ProductsView({
  products,
  activeProducts,
  archivedProducts,
  stock,
  prices,
  movements,
  lastAdjustedAt,
  showPrices,
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
  newProductName,
  setNewProductName,
  newProductHl,
  setNewProductHl,
  onAddProduct,
  onArchiveProduct,
  onRestoreProduct,
  onMoveProduct,
  showArchived,
  setShowArchived,
}) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "#8A8574", fontWeight: 600 }}>PRODUCTOS</div>
        <button
          onClick={onToggleEditMode}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: editMode ? "#22261F" : "transparent",
            color: editMode ? "#F7F4EC" : "#22261F",
            border: "1px solid #22261F",
            borderRadius: 7, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          <Settings2 size={14} />
          {editMode ? "Guardar existencias" : "Ajustar existencias"}
        </button>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {activeProducts.map((p, i) => {
          const qty = stock[p.code] || 0;
          const isLow = qty <= lowStockThresholdFor(p);
          const lastMovement = movements.find((m) => m.code === p.code);
          return (
            <div
              key={p.code}
              className="rowfade"
              style={{
                background: "#FFFFFF",
                border: `1px solid ${isLow ? "#E9CFA0" : "#E7E2D3"}`,
                borderRadius: 12,
                padding: "16px 18px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flex: "1 1 200px", minWidth: 0 }}>
                  <div style={{
                    width: 6, height: 40, borderRadius: 3, background: p.color, flexShrink: 0,
                  }} />
                  <div style={{ minWidth: 0 }}>
                    {editMode ? (
                      <input
                        type="text"
                        value={editNameInputs[p.code] ?? p.name}
                        onChange={(e) => setEditNameInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                        style={{
                          fontWeight: 700, fontSize: 15.5, border: "1px solid #D8D2C0", borderRadius: 7,
                          padding: "4px 8px", marginBottom: 2, width: "100%", boxSizing: "border-box",
                        }}
                      />
                    ) : (
                      <div style={{ fontWeight: 700, fontSize: 15.5 }}>{p.name}</div>
                    )}
                    {editMode && (
                      <>
                        <div style={{ fontSize: 12, color: "#9A9484" }}>{p.short}{lastMovement ? ` · último movimiento ${formatDate(lastMovement.date)}` : ""}</div>
                        {lastAdjustedAt[p.code] && (
                          <div style={{ fontSize: 11, color: "#B4AF9E" }}>ajustado {formatDateTime(lastAdjustedAt[p.code])}</div>
                        )}
                      </>
                    )}
                    {!editMode && showPrices && (
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#3C6E4A", marginTop: 2 }}>
                        {prices[p.code] ? formatCUP(prices[p.code]) : "Precio no definido"}
                      </div>
                    )}
                  </div>
                </div>

                {!editMode && (
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: isLow ? "#B4661E" : "#22261F" }}>
                      {qty} <span style={{ fontSize: 12, fontWeight: 500, color: "#9A9484" }}>uds</span>
                    </div>
                  </div>
                )}

                {editMode && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                    <IconButton
                      icon={<ArrowUp size={14} />}
                      onClick={() => onMoveProduct(p.code, -1)}
                      disabled={i === 0}
                      title="Subir"
                      size={30}
                    />
                    <IconButton
                      icon={<ArrowDown size={14} />}
                      onClick={() => onMoveProduct(p.code, 1)}
                      disabled={i === activeProducts.length - 1}
                      title="Bajar"
                      size={30}
                    />
                  </div>
                )}
              </div>

              {editMode && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 12px", marginTop: 12 }}>
                  <div>
                    <FieldLabel>STOCK ACTUAL</FieldLabel>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={editInputs[p.code]}
                      onChange={(e) => setEditInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                      style={{
                        width: "100%", boxSizing: "border-box", fontSize: 18, fontWeight: 700,
                        border: "1px solid #D8D2C0", borderRadius: 7, padding: "7px 10px",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    />
                  </div>
                  <div>
                    <FieldLabel>PRECIO CUP</FieldLabel>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={editPriceInputs[p.code]}
                      onChange={(e) => setEditPriceInputs((s) => ({ ...s, [p.code]: e.target.value }))}
                      title="Precio en CUP"
                      style={{
                        width: "100%", boxSizing: "border-box", fontSize: 14, fontWeight: 600,
                        border: "1px solid #D8D2C0", borderRadius: 7, padding: "8px 10px",
                        fontVariantNumeric: "tabular-nums", color: "#26241F",
                      }}
                    />
                  </div>
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
                        border: "1px solid #D8D2C0", borderRadius: 7, padding: "8px 10px",
                        fontVariantNumeric: "tabular-nums", color: "#26241F",
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
                        border: "1px solid #D8D2C0", borderRadius: 7, padding: "8px 10px",
                        fontVariantNumeric: "tabular-nums", color: "#26241F",
                      }}
                    />
                  </div>
                </div>
              )}

              {editMode && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                  <button
                    onClick={() => onArchiveProduct(p.code)}
                    title="Eliminar producto"
                    aria-label="Eliminar producto"
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      background: "transparent", border: "1px solid #E7E2D3", color: "#8A5A1E",
                      borderRadius: 7, padding: "6px 10px", fontSize: 12, cursor: "pointer",
                    }}
                  >
                    <Trash2 size={13} /> Eliminar producto
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {editMode && (
          <div
            style={{
              background: "#FFFFFF", border: "1px dashed #D8D2C0", borderRadius: 12,
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
                flex: "1 1 auto", minWidth: 160, border: "1px solid #E7E2D3", borderRadius: 7,
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
                flex: "0 1 110px", minWidth: 90, border: "1px solid #E7E2D3", borderRadius: 7,
                padding: "9px 12px", fontSize: 14,
              }}
            />
            <button
              onClick={onAddProduct}
              style={{
                flex: "0 0 auto", background: "#22261F", color: "#F7F4EC", border: "none",
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
              color: "#8A8574", fontSize: 12, letterSpacing: "0.1em", fontWeight: 600, cursor: "pointer",
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
                    borderTop: i === 0 ? "none" : "1px solid #F0EDE2",
                  }}
                >
                  <span>{p.name}</span>
                  <button
                    onClick={() => onRestoreProduct(p.code)}
                    style={{
                      background: "transparent", border: "1px solid #E7E2D3", color: "#3C6E4A",
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
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, letterSpacing: "0.1em", color: "#8A8574", fontWeight: 600, marginBottom: 10 }}>
          <History size={14} /> HISTORIAL DE MOVIMIENTOS
        </div>
        {movements.length === 0 ? (
          <div style={{ fontSize: 13.5, color: "#9A9484", padding: "10px 2px" }}>
            Aún no hay movimientos registrados.
          </div>
        ) : (
          <Card>
            {movements.slice(0, 25).map((m, i) => {
              const product = products.find((p) => p.code === m.code);
              return (
                <div
                  key={m.id}
                  style={{
                    display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center",
                    gap: 6, padding: "10px 16px", fontSize: 13.5,
                    borderTop: i === 0 ? "none" : "1px solid #F0EDE2",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: product?.color || "#9A9484" }} />
                    <span style={{ fontWeight: 600 }}>{product?.short || m.code}</span>
                    <span style={{ color: "#9A9484" }}>{m.type === "venta" ? "venta" : "ajuste manual"}</span>
                  </div>
                  <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                    <span style={{ color: "#9A9484", fontSize: 12 }}>{formatDate(m.date)}</span>
                    <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: m.type === "venta" ? "#B4661E" : (m.qty >= 0 ? "#3C6E4A" : "#B4661E") }}>
                      {m.type === "venta" ? `-${m.qty}` : (m.qty >= 0 ? `+${m.qty}` : m.qty)}
                    </span>
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </>
  );
}
