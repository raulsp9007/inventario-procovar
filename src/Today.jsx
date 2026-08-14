import { todayStr } from "./dateUtils";
import { formatCUP, formatUSD, convertToUSD, totalHlSold } from "./money";

export default function Today({ products, movements, stock, showPrices, exchangeRate }) {
  const today = todayStr();
  const todaysMovements = movements.filter((m) => m.date === today);
  const todaysSales = todaysMovements.filter((m) => m.type === "venta");
  const todaysSentSales = todaysSales.filter((m) => m.sent);
  const todaysPendingSales = todaysSales.filter((m) => !m.sent);
  const unitsSold = todaysSentSales.reduce((sum, m) => sum + m.qty, 0);
  const dayRevenue = todaysSentSales.reduce((sum, m) => sum + m.qty * (m.unitPrice || 0), 0);
  const dayRevenueUSD = convertToUSD(dayRevenue, exchangeRate);
  const hlSoldToday = totalHlSold(todaysSentSales, products);
  const ordersToday = new Set(todaysSentSales.filter((m) => m.orderId).map((m) => m.orderId)).size;

  const activeProducts = products.filter((p) => !p.archived);
  const rows = activeProducts
    .map((p) => ({
      product: p,
      soldToday: todaysSentSales.filter((m) => m.code === p.code).reduce((sum, m) => sum + m.qty, 0),
      pendingToday: todaysPendingSales.filter((m) => m.code === p.code).reduce((sum, m) => sum + m.qty, 0),
      stockLeft: stock[p.code] || 0,
    }))
    .map((row) => ({ ...row, disponibleLibre: row.stockLeft - row.pendingToday }))
    .sort((a, b) => b.soldToday - a.soldToday);

  return (
    <div>
      <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "#8A8574", fontWeight: 600, marginBottom: 10 }}>
        HOY
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 20 }}>
        <div style={{ background: "#FFFFFF", border: "1px solid #E7E2D3", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, color: "#8A8574", letterSpacing: "0.06em", marginBottom: 4 }}>UNIDADES VENDIDAS</div>
          <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{unitsSold}</div>
        </div>

        {showPrices && (
          <div style={{ background: "#FFFFFF", border: "1px solid #E7E2D3", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: "#8A8574", letterSpacing: "0.06em", marginBottom: 4 }}>INGRESO DEL DÍA</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatCUP(dayRevenue)}</div>
            {dayRevenueUSD !== null && (
              <div style={{ fontSize: 12.5, color: "#8A8574" }}>{formatUSD(dayRevenueUSD)}</div>
            )}
          </div>
        )}

        <div style={{ background: "#FFFFFF", border: "1px solid #E7E2D3", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, color: "#8A8574", letterSpacing: "0.06em", marginBottom: 4 }}>PEDIDOS DE HOY</div>
          <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{ordersToday}</div>
        </div>

        <div style={{ background: "#FFFFFF", border: "1px solid #E7E2D3", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, color: "#8A8574", letterSpacing: "0.06em", marginBottom: 4 }}>HL VENDIDOS</div>
          <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{hlSoldToday.toFixed(2)}</div>
        </div>
      </div>

      <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "#8A8574", fontWeight: 600, marginBottom: 10 }}>
        POR PRODUCTO
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 13.5, color: "#9A9484", padding: "10px 2px" }}>
          Sin productos activos.
        </div>
      ) : (
        <div style={{ background: "#FFFFFF", border: "1px solid #E7E2D3", borderRadius: 12, overflow: "hidden" }}>
          {rows.map((row, i) => (
            <div
              key={row.product.code}
              style={{
                display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center",
                gap: 6, padding: "12px 16px", fontSize: 14,
                borderTop: i === 0 ? "none" : "1px solid #F0EDE2",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 6, height: 24, borderRadius: 3, background: row.product.color, flexShrink: 0 }} />
                <span style={{ fontWeight: 600 }}>{row.product.short}</span>
              </div>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <span style={{ fontSize: 12.5, color: "#8A8574" }}>
                  Vendido hoy: <span style={{ fontWeight: 700, color: "#26241F", fontVariantNumeric: "tabular-nums" }}>{row.soldToday}</span>
                </span>
                {row.pendingToday > 0 && (
                  <span style={{ fontSize: 12.5, color: "#B57A2E" }}>
                    Pendiente: <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{row.pendingToday}</span>
                  </span>
                )}
                <span style={{ fontSize: 12.5, color: "#8A8574" }}>
                  Stock: <span style={{ fontWeight: 700, color: "#26241F", fontVariantNumeric: "tabular-nums" }}>{row.stockLeft}</span>
                </span>
                {row.pendingToday > 0 && (
                  <span style={{ fontSize: 12.5, color: "#8A8574" }}>
                    Disponible libre: <span style={{ fontWeight: 700, color: "#26241F", fontVariantNumeric: "tabular-nums" }}>{row.disponibleLibre}</span>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
