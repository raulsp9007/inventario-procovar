import { useState, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { formatCUP, getProductSalesTotals } from "./money";
import { getCustomerSalesTotals } from "./customerHelpers";
import { todayStr, getWeekStartStr, getMonthStartStr } from "./dateUtils";
import { customerLabel } from "./nameLabels";

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

// Donut (no pie sólido): hueco central relleno con --surface para que
// respire dentro de la tarjeta, en vez de un disco macizo.
function PieChart({ slices, size = 96 }) {
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
      <circle cx={r} cy={r} r={r * 0.55} fill="var(--surface)" />
    </svg>
  );
}

// Leyenda: solo nombre + porcentaje (el monto/cantidad ya se ve en las
// tarjetas de abajo -- barras de producto y lista de top clientes -- así
// que repetirlo acá era ruido, no información nueva).
function Legend({ slices }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9, flex: 1, minWidth: 0 }}>
      {slices.map((s) => (
        <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {s.label}
          </span>
          <span style={{ fontSize: 11.5, color: "var(--faint)", flexShrink: 0 }}>
            {total > 0 ? Math.round((s.value / total) * 100) : 0}%
          </span>
        </div>
      ))}
    </div>
  );
}

const CUSTOMER_COLORS = ["#C9752A", "#4E7A7F", "#8A6D3B", "#946B8A", "#2F6B4F"];

function EmptyState({ children }) {
  return <div style={{ textAlign: "center", padding: "36px 12px", color: "var(--faint)", fontSize: 13, fontWeight: 600 }}>{children}</div>;
}

function Card({ title, rangeLabel, children }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>{rangeLabel}</div>
      {children}
    </div>
  );
}

export default function Portfolio({ products, movements, showPrices }) {
  const [range, setRange] = useState("historico");
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false);
  const { start, end } = rangeFor(range);
  const rangeLabel = RANGES.find((r) => r.value === range).label;

  const productRows = useMemo(
    () => getProductSalesTotals(movements, products, { start, end }).sort((a, b) => b.qty - a.qty),
    [movements, products, start, end]
  );
  // getCustomerSalesTotals siempre ordena por ingreso -- acá se reordena por
  // cantidad cuando los precios están ocultos, así "más consumidores" separa
  // por lo que realmente se está mostrando (uds), no por un ingreso que ni
  // se ve.
  const customerRows = useMemo(() => {
    const rows = getCustomerSalesTotals(movements, products, { start, end });
    return showPrices ? rows : [...rows].sort((a, b) => b.qty - a.qty);
  }, [movements, products, start, end, showPrices]);

  const productSlices = productRows.map((r) => ({
    label: r.product.name,
    value: showPrices ? r.revenue : r.qty,
    color: r.product.color || "#8A8574",
  }));

  const topCustomers = customerRows.slice(0, 5);
  const othersValue = customerRows.slice(5).reduce((sum, r) => sum + (showPrices ? r.revenue : r.qty), 0);
  const customerSlices = topCustomers.map((r, i) => ({
    label: r.customerName,
    value: showPrices ? r.revenue : r.qty,
    color: CUSTOMER_COLORS[i % CUSTOMER_COLORS.length],
  }));
  if (othersValue > 0) customerSlices.push({ label: "Otros clientes", value: othersValue, color: "var(--faintest)" });

  const valueFormatter = (v) => (showPrices ? formatCUP(v) : `${v} uds`);

  return (
    <div>
      <div style={{ fontSize: 12, letterSpacing: "0.07em", color: "var(--muted)", fontWeight: 800, textTransform: "uppercase", marginBottom: 16 }}>
        PORTAFOLIO
      </div>

      <div style={{ position: "relative", marginBottom: 16, width: "fit-content" }}>
        <button
          onClick={() => setRangeMenuOpen((v) => !v)}
          style={{
            display: "flex", alignItems: "center", gap: 6, background: "var(--surface-subtle)", border: "1px solid var(--border)",
            borderRadius: 10, color: "var(--text)", fontSize: 13, fontWeight: 600, fontFamily: "inherit", padding: "0 12px", height: 40, cursor: "pointer",
          }}
        >
          {rangeLabel}
          <ChevronDown size={12} color="var(--faint)" />
        </button>
        {rangeMenuOpen && (
          <>
            <div onClick={() => setRangeMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
            <div style={{
              position: "absolute", top: 46, left: 0, background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 10, boxShadow: "0 8px 20px rgba(0,0,0,0.15)", overflow: "hidden", zIndex: 30, minWidth: 160,
            }}>
              {RANGES.map((r, i) => (
                <button
                  key={r.value}
                  onClick={() => { setRange(r.value); setRangeMenuOpen(false); }}
                  style={{
                    width: "100%", textAlign: "left", padding: "10px 12px", border: "none",
                    borderTop: i === 0 ? "none" : "1px solid var(--hairline)", background: "none", fontFamily: "inherit",
                    fontSize: 13, cursor: "pointer",
                    color: "var(--text)",
                    fontWeight: r.value === range ? 700 : 400,
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <Card title="Ventas por producto" rangeLabel={rangeLabel}>
        {productSlices.length === 0 ? (
          <EmptyState>Sin ventas en este rango</EmptyState>
        ) : (
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <PieChart slices={productSlices} />
            <Legend slices={productSlices} />
          </div>
        )}
      </Card>

      <Card title="Total vendido por producto" rangeLabel={rangeLabel}>
        {productRows.length === 0 ? (
          <EmptyState>Sin ventas en este rango</EmptyState>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {productRows.map((row) => (
              <div key={row.product.code}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{row.product.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{row.qty}</span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: "var(--surface-subtle)", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%", borderRadius: 999, background: row.product.color || "#8A8574",
                      width: `${Math.max(4, Math.round((row.qty / productRows[0].qty) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Clientes más consumidores" rangeLabel={rangeLabel}>
        {customerSlices.length === 0 ? (
          <EmptyState>Sin datos en este rango</EmptyState>
        ) : (
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <PieChart slices={customerSlices} />
            <Legend slices={customerSlices} />
          </div>
        )}
      </Card>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid var(--divider)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 2 }}>Top clientes por producto favorito</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>{rangeLabel}</div>
        </div>
        {customerRows.length === 0 ? (
          <EmptyState>Sin datos en este rango</EmptyState>
        ) : (
          customerRows.slice(0, 10).map((row, i, arr) => {
            const product = products.find((p) => p.code === row.favoriteProductCode);
            return (
              <div
                key={row.customerName}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
                  borderBottom: i === arr.length - 1 ? "none" : "1px solid var(--hairline)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {customerLabel(row.customerName)}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                    Favorito: {product ? product.short : "—"}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>{valueFormatter(showPrices ? row.revenue : row.qty)}</div>
                  {showPrices && (
                    <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 1 }}>{row.qty} uds</div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
