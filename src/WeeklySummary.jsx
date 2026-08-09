import { getWeekStartStr, getPreviousWeekRangeStr, getMonthStartStr, todayStr, formatDate } from "./dateUtils";
import { formatCUP, revenueInRange, totalRevenueInRange } from "./money";

export default function WeeklySummary({
  products,
  movements,
  cumulativeRevenue,
  exchangeRate,
  commissionPercent,
  showPrices,
  onExchangeRateChange,
  onCommissionPercentChange,
}) {
  const weekStart = getWeekStartStr();
  const today = todayStr();
  const { start: prevStart, end: prevEnd } = getPreviousWeekRangeStr();
  const monthStart = getMonthStartStr();
  const weekTotal = totalRevenueInRange(movements, weekStart, today);
  const monthTotal = totalRevenueInRange(movements, monthStart, today);
  const monthName = new Date(monthStart + "T00:00:00").toLocaleDateString("es-ES", { month: "long", year: "numeric" });

  const soldInRange = (code, start, end) =>
    movements
      .filter((m) => m.code === code && m.type === "venta" && m.date >= start && m.date <= end)
      .reduce((sum, m) => sum + m.qty, 0);

  return (
    <div>
      <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "#8A8574", fontWeight: 600, marginBottom: 10 }}>
        RESUMEN SEMANAL · {formatDate(weekStart)} – {formatDate(today)}
      </div>
      <div style={{ background: "#FFFFFF", border: "1px solid #E7E2D3", borderRadius: 12, overflow: "hidden" }}>
        {products.map((p, i) => {
          const current = soldInRange(p.code, weekStart, today);
          const previous = soldInRange(p.code, prevStart, prevEnd);
          const hasComparison = previous > 0;
          const pctChange = hasComparison ? Math.round(((current - previous) / previous) * 100) : null;
          const revenue = revenueInRange(movements, p.code, weekStart, today);
          return (
            <div
              key={p.code}
              style={{
                display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center",
                gap: 6, padding: "12px 16px", fontSize: 14,
                borderTop: i === 0 ? "none" : "1px solid #F0EDE2",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 6, height: 24, borderRadius: 3, background: p.color, flexShrink: 0 }} />
                <span style={{ fontWeight: 600 }}>{p.short}</span>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{current} uds</span>
                {showPrices && (
                  <span style={{ fontSize: 12.5, color: "#8A8574", fontVariantNumeric: "tabular-nums" }}>{formatCUP(revenue)}</span>
                )}
                <span style={{ fontSize: 12.5, color: pctChange === null ? "#9A9484" : pctChange >= 0 ? "#3C6E4A" : "#B4661E" }}>
                  {pctChange === null ? "—" : `${pctChange >= 0 ? "↑" : "↓"} ${Math.abs(pctChange)}%`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {showPrices && (
        <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", background: "#FFFFFF", border: "1px solid #E7E2D3", borderRadius: 12, padding: "12px 16px", fontSize: 14 }}>
            <span style={{ color: "#8A8574" }}>Total semana actual</span>
            <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatCUP(weekTotal)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", background: "#FFFFFF", border: "1px solid #E7E2D3", borderRadius: 12, padding: "12px 16px", fontSize: 14 }}>
            <span style={{ color: "#8A8574" }}>Total {monthName}</span>
            <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatCUP(monthTotal)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
