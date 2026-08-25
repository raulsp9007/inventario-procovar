import { formatCUP, formatUSD, convertToUSD, totalHlSold } from "./money";
import Banner from "./Banner.jsx";

// `movements` ya viene filtrado por el llamador (InventoryApp.jsx) según qué
// pedidos le tocan a esta pestaña -- este componente solo resume/muestra.
// `pendingMode` (pestaña Mañana): lo que llega mezcla dos cosas -- pedidos
// de HOY sin enviar todavía (ya comprometidos, stock/ingreso ya aplicados,
// solo falta despacharlos) y reservas para mañana sin comprometer (esas sí
// esperan a enviarse para tocar stock/ingreso). Se cuenta todo junto como
// "pendiente de envío", sin separar enviado/pendiente (acá no hay "enviado").
export default function Today({
  products, movements, stock, showPrices, exchangeRate,
  title = "HOY", ordersLabel = "PEDIDOS DE HOY", soldLabel = "Vendido hoy",
  pendingMode = false,
  onProductClick = null,
}) {
  const todaysSales = movements.filter((m) => m.type === "venta");
  const todaysSentSales = pendingMode ? todaysSales : todaysSales.filter((m) => m.sent);
  const todaysPendingSales = pendingMode ? [] : todaysSales.filter((m) => !m.sent);
  const unitsSold = todaysSentSales.reduce((sum, m) => sum + m.qty, 0);
  const dayRevenue = todaysSentSales.reduce((sum, m) => sum + m.qty * (m.unitPrice || 0), 0);
  const dayRevenueUSD = convertToUSD(dayRevenue, exchangeRate);
  const hlSoldToday = totalHlSold(todaysSentSales, products);
  const ordersToday = new Set(todaysSentSales.filter((m) => m.orderId).map((m) => m.orderId)).size;

  const activeProducts = products.filter((p) => !p.archived);
  const allRows = activeProducts
    .map((p) => ({
      product: p,
      soldToday: todaysSentSales.filter((m) => m.code === p.code).reduce((sum, m) => sum + m.qty, 0),
      pendingToday: todaysPendingSales.filter((m) => m.code === p.code).reduce((sum, m) => sum + m.qty, 0),
      stockLeft: stock[p.code] || 0,
    }))
    .map((row) => ({ ...row, disponibleLibre: row.stockLeft - row.pendingToday }))
    .sort((a, b) => b.soldToday - a.soldToday);
  // En Hoy se muestra siempre todo lo activo, aunque la venta del día haya
  // dejado el stock en 0 -- es justamente el resumen de lo vendido hoy, no
  // tendría sentido que un producto agotado desapareciera de esa lista.
  // En Mañana (pendingMode) un producto en 0 sigue oculto salvo que todavía
  // tenga algo reservado sin consolidar en esta vista.
  const rows = pendingMode ? allRows.filter((row) => row.stockLeft > 0 || row.soldToday > 0) : allRows;

  return (
    <div>
      <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "var(--text-muted)", fontWeight: 600, marginBottom: 10 }}>
        {title}
      </div>

      {pendingMode && (
        <Banner variant="warning" style={{ marginBottom: 14 }}>
          Pendiente de envío: pedidos de hoy sin enviar + reservas para mañana. Las reservas no descuentan stock ni suman ingreso hasta que las envíes.
        </Banner>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 20 }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.06em", marginBottom: 4 }}>{pendingMode ? "UNIDADES PENDIENTES" : "UNIDADES VENDIDAS"}</div>
          <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{unitsSold}</div>
        </div>

        {showPrices && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.06em", marginBottom: 4 }}>{pendingMode ? "INGRESO PENDIENTE" : "INGRESO DEL DÍA"}</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatCUP(dayRevenue)}</div>
            {dayRevenueUSD !== null && (
              <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{formatUSD(dayRevenueUSD)}</div>
            )}
          </div>
        )}

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.06em", marginBottom: 4 }}>{ordersLabel}</div>
          <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{ordersToday}</div>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.06em", marginBottom: 4 }}>HL {pendingMode ? "PENDIENTES" : "VENDIDOS"}</div>
          <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{hlSoldToday.toFixed(2)}</div>
        </div>
      </div>

      <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "var(--text-muted)", fontWeight: 600, marginBottom: 10 }}>
        POR PRODUCTO
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 13.5, color: "var(--text-faint)", padding: "10px 2px" }}>
          {activeProducts.length === 0 ? "Sin productos activos." : "Todo el stock activo está en cero."}
        </div>
      ) : (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          {rows.map((row, i) => (
            <div
              key={row.product.code}
              onClick={onProductClick ? () => onProductClick(row.product.code) : undefined}
              style={{
                display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center",
                gap: 6, padding: "12px 16px", fontSize: 14, cursor: onProductClick ? "pointer" : "default",
                borderTop: i === 0 ? "none" : "1px solid var(--divider)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 6, height: 24, borderRadius: 3, background: row.product.color, flexShrink: 0 }} />
                <span style={{ fontWeight: 600 }}>{row.product.short}</span>
              </div>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                  {soldLabel}: <span style={{ fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{row.soldToday}</span>
                </span>
                {row.pendingToday > 0 && (
                  <span style={{ fontSize: 12.5, color: "var(--accent-orange-soft-text)" }}>
                    Pendiente: <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{row.pendingToday}</span>
                  </span>
                )}
                <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                  Stock: <span style={{ fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{row.stockLeft}</span>
                </span>
                {row.pendingToday > 0 && (
                  <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                    Disponible libre: <span style={{ fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{row.disponibleLibre}</span>
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
