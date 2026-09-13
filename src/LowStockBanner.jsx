import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

// Aviso de stock bajo -- componente de presentación pura, misma idea que
// CierreDeVentasBanner.jsx. Tres formatos según cuántos productos entran en
// aviso, para que el banner nunca crezca sin límite (altura tope ≈130px):
// - 1 a 4: lista completa, una fila por producto.
// - 5 a 9: fichas pill en 2-3 líneas, nombre corto.
// - 10+: resumen "X en cero · Y por debajo del aviso" + máximo 5 fichas
//   (las de stock 0 primero, en rojo) + ficha "Ver los N" que filtra la
//   lista de Productos a estos mismos productos.
// "Bajo stock" acá incluye los productos en 0 (a diferencia del contador
// viejo, que los excluía) -- el diseño los distingue con la ficha roja en
// vez de escondiéndolos del aviso.
export default function LowStockBanner({ activeProducts, stock, lowStockThresholdFor, onViewAll }) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("procovar-banner-stock-bajo-colapsado") === "1";
    } catch {
      return false;
    }
  });

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("procovar-banner-stock-bajo-colapsado", next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  const lowStock = activeProducts
    .filter((p) => (stock[p.code] || 0) <= lowStockThresholdFor(p))
    .sort((a, b) => (stock[a.code] || 0) - (stock[b.code] || 0));

  if (lowStock.length === 0) return null;

  const n = lowStock.length;
  const zeroCount = lowStock.filter((p) => (stock[p.code] || 0) === 0).length;

  return (
    <div style={{ background: "var(--banner-bg)", border: "1px solid var(--border-warn)", borderRadius: 12, padding: "11px 12px", marginBottom: 16 }}>
      <button
        onClick={toggleCollapsed}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
          background: "transparent", border: "none", padding: 0, cursor: "pointer",
        }}
      >
        <AlertTriangle size={15} strokeWidth={2} color="var(--orange)" />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--orange-text)" }}>
          POCO STOCK · {n}
        </span>
        <span style={{ flex: 1 }} />
        {collapsed ? <ChevronDown size={14} strokeWidth={2} color="var(--orange)" /> : <ChevronUp size={14} strokeWidth={2} color="var(--orange)" />}
      </button>

      {!collapsed && n <= 4 && (
        <div style={{ display: "flex", flexDirection: "column", marginTop: 9 }}>
          {lowStock.map((p, i) => (
            <div
              key={p.code}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "6px 0",
                borderTop: i === 0 ? "none" : "1px solid var(--banner-divider)",
              }}
            >
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: "var(--orange-text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {p.name}
              </span>
              <span style={{ flexShrink: 0, fontSize: 14, fontWeight: 700, color: "var(--orange)", fontVariantNumeric: "tabular-nums" }}>
                {stock[p.code] || 0}
              </span>
            </div>
          ))}
        </div>
      )}

      {!collapsed && n >= 5 && n <= 9 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9 }}>
          {lowStock.map((p) => (
            <span
              key={p.code}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "var(--chip-bg)", border: "1px solid var(--border-warn)", borderRadius: 999, padding: "5px 10px",
              }}
            >
              <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--orange-text-2)" }}>{p.short}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--orange)", fontVariantNumeric: "tabular-nums" }}>{stock[p.code] || 0}</span>
            </span>
          ))}
        </div>
      )}

      {!collapsed && n >= 10 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--orange-text)", marginTop: 8 }}>
            {zeroCount > 0 && <strong style={{ fontWeight: 700 }}>{zeroCount} en cero</strong>}
            {zeroCount > 0 && n - zeroCount > 0 && " · "}
            {n - zeroCount > 0 && `${n - zeroCount} por debajo del aviso`}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9 }}>
            {lowStock.slice(0, 5).map((p) => {
              const isZero = (stock[p.code] || 0) === 0;
              return (
                <span
                  key={p.code}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999, padding: "5px 10px",
                    background: isZero ? "var(--red)" : "var(--chip-bg)",
                    border: `1px solid ${isZero ? "var(--red)" : "var(--border-warn)"}`,
                  }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 500, color: isZero ? "var(--cream)" : "var(--orange-text-2)" }}>{p.short}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: isZero ? "var(--cream)" : "var(--orange)" }}>{stock[p.code] || 0}</span>
                </span>
              );
            })}
            <button
              onClick={onViewAll}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4, borderRadius: 999, padding: "5px 10px",
                background: "var(--chip-bg)", border: "1px dashed var(--orange-2)", cursor: "pointer",
                fontSize: 12.5, fontWeight: 600, color: "var(--orange-text)",
              }}
            >
              Ver los {n} ›
            </button>
          </div>
        </>
      )}
    </div>
  );
}
