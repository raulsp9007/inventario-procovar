import { useState } from "react";
import { getWeekStartStr, getPreviousWeekRangeStr, getMonthStartStr, businessDayStr, formatDate } from "./dateUtils";
import { formatCUP, formatUSD, convertToUSD, revenueInRange, totalRevenueInRange, monthWeeklyBreakdown } from "./money";

export default function WeeklySummary({
  products,
  movements,
  cumulativeRevenue,
  cumulativeHl,
  exchangeRate,
  commissionPercent,
  showPrices,
  onCommissionPercentChange,
  hlGoal,
  onHlGoalChange,
}) {
  const weekStart = getWeekStartStr();
  const today = businessDayStr();
  const { start: prevStart, end: prevEnd } = getPreviousWeekRangeStr();
  const monthStart = getMonthStartStr();
  const weekTotal = totalRevenueInRange(movements, weekStart, today);
  const monthTotal = totalRevenueInRange(movements, monthStart, today);
  const monthName = new Date(monthStart + "T00:00:00").toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  const weeklyBreakdown = monthWeeklyBreakdown(movements, monthStart, today);
  const cumulativeUSD = convertToUSD(cumulativeRevenue, exchangeRate);
  const commissionCUP = (cumulativeRevenue * (commissionPercent || 0)) / 100;
  const commissionUSD = convertToUSD(commissionCUP, exchangeRate);
  const [commissionInput, setCommissionInput] = useState(() => (commissionPercent ? String(commissionPercent) : ""));
  const [hlGoalInput, setHlGoalInput] = useState(() => (hlGoal != null ? String(hlGoal) : ""));
  const hlSold = cumulativeHl || 0;
  const hlPct = hlGoal != null && hlGoal > 0 ? Math.round((hlSold / hlGoal) * 100) : null;
  const activeProducts = products.filter((p) => !p.archived);

  const soldInRange = (code, start, end) =>
    movements
      .filter((m) => m.code === code && m.type === "venta" && m.date >= start && m.date <= end)
      .reduce((sum, m) => sum + m.qty, 0);

  return (
    <div>
      <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "var(--text-muted)", fontWeight: 600, marginBottom: 10 }}>
        RESUMEN SEMANAL · {formatDate(weekStart)} – {formatDate(today)}
      </div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
        {activeProducts.map((p, i) => {
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
                borderTop: i === 0 ? "none" : "1px solid var(--divider)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 6, height: 24, borderRadius: 3, background: p.color, flexShrink: 0 }} />
                <span style={{ fontWeight: 600 }}>{p.short}</span>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{current} uds</span>
                {showPrices && (
                  <span style={{ fontSize: 12.5, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{formatCUP(revenue)}</span>
                )}
                <span style={{ fontSize: 12.5, color: pctChange === null ? "var(--text-faint)" : pctChange >= 0 ? "var(--accent-green-text)" : "var(--accent-orange-text)" }}>
                  {pctChange === null ? "—" : `${pctChange >= 0 ? "↑" : "↓"} ${Math.abs(pctChange)}%`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {showPrices && (
        <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px", fontSize: 14 }}>
            <span style={{ color: "var(--text-muted)" }}>Total semana actual</span>
            <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatCUP(weekTotal)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px", fontSize: 14 }}>
            <span style={{ color: "var(--text-muted)" }}>Total {monthName}</span>
            <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatCUP(monthTotal)}</span>
          </div>

          {weeklyBreakdown.length > 0 && (
            <div>
              <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "var(--text-muted)", fontWeight: 600, marginBottom: 10 }}>
                HISTORIAL SEMANAL DE {monthName.toUpperCase()}
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                {weeklyBreakdown.map((w, i) => (
                  <div
                    key={w.weekStart}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "10px 16px", fontSize: 13.5,
                      borderTop: i === 0 ? "none" : "1px solid var(--divider)",
                    }}
                  >
                    <span style={{ color: "var(--text-muted)" }}>
                      Semana del {formatDate(w.weekStart < monthStart ? monthStart : w.weekStart)}
                    </span>
                    <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatCUP(w.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 16, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 12, letterSpacing: "0.1em", color: "var(--text-muted)", fontWeight: 600 }}>TOTAL GENERAL ACUMULADO</span>
          {showPrices && (
            <span style={{ fontWeight: 700, fontSize: 16, fontVariantNumeric: "tabular-nums" }}>
              {formatCUP(cumulativeRevenue)}
              {cumulativeUSD !== null && <span style={{ color: "var(--text-muted)", fontWeight: 500, fontSize: 13 }}> · {formatUSD(cumulativeUSD)}</span>}
            </span>
          )}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 8 }}>
          <label style={{ fontSize: 13, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
            Comisión
            <input
              type="number"
              inputMode="decimal"
              value={commissionInput}
              onChange={(e) => {
                const raw = e.target.value;
                setCommissionInput(raw);
                const val = parseFloat(raw);
                onCommissionPercentChange(isNaN(val) || val < 0 ? 0 : val);
              }}
              placeholder="0"
              style={{
                width: 60, border: "1px solid var(--border)", borderRadius: 7,
                padding: "6px 8px", fontSize: 13, fontVariantNumeric: "tabular-nums",
              }}
            />
            %
          </label>
        </div>

        {showPrices && commissionPercent > 0 && (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Comisión ({commissionPercent}%):{" "}
            <span style={{ fontWeight: 700, color: "var(--text)" }}>
              {commissionUSD !== null ? formatUSD(commissionUSD) : formatCUP(commissionCUP)}
            </span>
            {commissionUSD === null && <span> (definí la tasa USD en Productos para verla en dólares)</span>}
          </div>
        )}
      </div>

      <div style={{ marginTop: 16, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 12, letterSpacing: "0.1em", color: "var(--text-muted)", fontWeight: 600 }}>HECTOLITROS</span>
          <span style={{ fontWeight: 700, fontSize: 16, fontVariantNumeric: "tabular-nums" }}>
            {hlSold.toFixed(2)} hL
          </span>
        </div>

        <label style={{ fontSize: 13, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          Meta HL
          <input
            type="number"
            inputMode="decimal"
            value={hlGoalInput}
            onChange={(e) => {
              const raw = e.target.value;
              setHlGoalInput(raw);
              const val = parseFloat(raw);
              onHlGoalChange(isNaN(val) || val <= 0 ? null : val);
            }}
            placeholder="meta"
            style={{
              width: 90, border: "1px solid var(--border)", borderRadius: 7,
              padding: "6px 8px", fontSize: 13, fontVariantNumeric: "tabular-nums",
            }}
          />
          hL
        </label>

        {hlGoal != null && (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Vendido: <span style={{ fontWeight: 700, color: "var(--text)" }}>{hlSold.toFixed(2)} hL</span> de {hlGoal} hL ({hlPct}%)
          </div>
        )}
      </div>
    </div>
  );
}
