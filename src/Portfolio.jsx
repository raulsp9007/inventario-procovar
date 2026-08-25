import { useState, useMemo } from "react";
import { formatCUP, getProductSalesTotals } from "./money";
import { getCustomerSalesTotals } from "./customerHelpers";
import { todayStr, getWeekStartStr, getMonthStartStr } from "./dateUtils";

const RANGES = [
  { value: "hoy", label: "Hoy" },
  { value: "semana", label: "Esta semana" },
  { value: "mes", label: "Este mes" },
  { value: "historico", label: "Histórico" },
];

function rangeFor(value) {
  const today = todayStr();
  if (value === "hoy") return { start: today, end: today };
  if (value === "semana") return { start: getWeekStartStr(today), end: today };
  if (value === "mes") return { start: getMonthStartStr(today), end: today };
  return { start: null, end: null };
}

// Slices en sentido horario desde arriba -- path SVG estándar de pie chart.
function polarPoint(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function PieChart({ slices, size = 150 }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return null;
  const r = size / 2;
  let angle = 0;
  const paths = slices.map((s) => {
    const sweep = (s.value / total) * 360;
    if (sweep >= 359.999) {
      angle += sweep;
      return { key: s.label, full: true, color: s.color };
    }
    const start = polarPoint(r, r, r, angle);
    const end = polarPoint(r, r, r, angle + sweep);
    const largeArc = sweep > 180 ? 1 : 0;
    const d = `M ${r} ${r} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
    angle += sweep;
    return { key: s.label, d, color: s.color };
  });
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ flexShrink: 0 }}>
      {paths.map((p) =>
        p.full ? (
          <circle key={p.key} cx={r} cy={r} r={r} fill={p.color} />
        ) : (
          <path key={p.key} d={p.d} fill={p.color} />
        )
      )}
    </svg>
  );
}

function Legend({ slices, valueFormatter }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  return (
    <div style={{ display: "grid", gap: 6, flex: 1, minWidth: 150 }}>
      {slices.map((s) => (
        <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
          <span style={{ color: "var(--text-muted)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
            {total > 0 ? Math.round((s.value / total) * 100) : 0}%
          </span>
          <span style={{ fontWeight: 600, flexShrink: 0, fontVariantNumeric: "tabular-nums", minWidth: 54, textAlign: "right" }}>
            {valueFormatter(s.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

const OTHERS_COLOR = "#8A8574";

export default function Portfolio({ products, movements, showPrices }) {
  const [range, setRange] = useState("historico");
  const { start, end } = rangeFor(range);

  const productRows = useMemo(
    () => getProductSalesTotals(movements, products, { start, end }).sort((a, b) => b.qty - a.qty),
    [movements, products, start, end]
  );
  const customerRows = useMemo(
    () => getCustomerSalesTotals(movements, products, { start, end }),
    [movements, products, start, end]
  );

  const productSlices = productRows.map((r) => ({
    label: r.product.name,
    value: showPrices ? r.revenue : r.qty,
    color: r.product.color || "#8A8574",
  }));

  const topCustomers = customerRows.slice(0, 5);
  const othersRevenue = customerRows.slice(5).reduce((sum, r) => sum + (showPrices ? r.revenue : r.qty), 0);
  const customerSlices = topCustomers.map((r, i) => ({
    label: r.customerName,
    value: showPrices ? r.revenue : r.qty,
    color: CUSTOMER_COLORS[i % CUSTOMER_COLORS.length],
  }));
  if (othersRevenue > 0) customerSlices.push({ label: "Otros clientes", value: othersRevenue, color: OTHERS_COLOR });

  const valueFormatter = (v) => (showPrices ? formatCUP(v) : `${v} uds`);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "var(--text-muted)", fontWeight: 600 }}>PORTAFOLIO</div>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value)}
          style={{
            border: "1px solid var(--border)", borderRadius: 7, padding: "7px 10px", fontSize: 12.5,
            background: "var(--surface)", color: "var(--text)",
          }}
        >
          {RANGES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, letterSpacing: "0.08em", color: "var(--text-muted)", fontWeight: 600, marginBottom: 12 }}>VENTAS POR PRODUCTO</div>
        {productSlices.length === 0 ? (
          <div style={{ fontSize: 13.5, color: "var(--text-faint)" }}>Sin ventas en este rango.</div>
        ) : (
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <PieChart slices={productSlices} />
            <Legend slices={productSlices} valueFormatter={valueFormatter} />
          </div>
        )}
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, letterSpacing: "0.08em", color: "var(--text-muted)", fontWeight: 600, marginBottom: 12 }}>CLIENTES MÁS CONSUMIDORES</div>
        {customerSlices.length === 0 ? (
          <div style={{ fontSize: 13.5, color: "var(--text-faint)" }}>Sin pedidos con cliente en este rango.</div>
        ) : (
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <PieChart slices={customerSlices} />
            <Legend slices={customerSlices} valueFormatter={valueFormatter} />
          </div>
        )}
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ fontSize: 12, letterSpacing: "0.08em", color: "var(--text-muted)", fontWeight: 600, padding: "12px 16px 0" }}>TOP CLIENTES POR PRODUCTO FAVORITO</div>
        {customerRows.length === 0 ? (
          <div style={{ fontSize: 13.5, color: "var(--text-faint)", padding: "10px 16px 16px" }}>Sin datos en este rango.</div>
        ) : (
          customerRows.slice(0, 10).map((row, i) => {
            const product = products.find((p) => p.code === row.favoriteProductCode);
            return (
              <div
                key={row.customerName}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                  padding: "10px 16px", fontSize: 13.5, borderTop: i === 0 ? "1px solid var(--divider)" : "1px solid var(--divider)",
                  marginTop: i === 0 ? 10 : 0,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.customerName}</div>
                  <div style={{ fontSize: 12, color: "var(--text-faint)" }}>
                    Favorito: {product ? product.short : "—"}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                  <div style={{ fontWeight: 600 }}>{valueFormatter(showPrices ? row.revenue : row.qty)}</div>
                  <div style={{ fontSize: 12, color: "var(--text-faint)" }}>{row.qty} uds</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const CUSTOMER_COLORS = ["#C77A2E", "#274E37", "#7F77DD", "#D4537E", "#378ADD"];
