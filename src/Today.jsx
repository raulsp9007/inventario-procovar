import { formatCUP, formatUSD, convertToUSD, totalHlSold } from "./money";
import { reservedForTomorrow } from "./orderHelpers.js";
import Banner from "./Banner.jsx";
import AnimatedNumber from "./AnimatedNumber.jsx";
import { goalTotals, isGoalProduct } from "./goals";

// `movements` ya viene filtrado por el llamador (InventoryApp.jsx) según qué
// pedidos le tocan a esta pestaña -- este componente solo resume/muestra.
// `billedMovements` (solo pendingMode): ventas de mañana que YA se marcaron
// Facturado -- quedan comprometidas (el stock ya bajó), así que no entran en
// `movements` (pendientes) ni en el resumen de hoy (su fecha es mañana). Sin
// esto esas unidades no se veían en ningún resumen: acá se muestran aparte.
// `pendingMode` (pestaña Mañana): lo que llega mezcla dos cosas -- pedidos
// de HOY sin enviar todavía (ya comprometidos, stock/ingreso ya aplicados,
// solo falta despacharlos) y reservas para mañana sin comprometer (esas sí
// esperan a enviarse para tocar stock/ingreso). Se cuenta todo junto como
// "pendiente de envío", sin separar enviado/pendiente (acá no hay "enviado").
export default function Today({
  products, movements, stock, allOrders = [], showPrices, exchangeRate,
  title = "HOY", ordersLabel = "PEDIDOS DE HOY", soldLabel = "Vendido hoy",
  pendingMode = false,
  billedMovements = [],
  blisterGoal = null,
  dailyHlGoal = null,
  onProductClick = null,
}) {
  const todaysSales = movements.filter((m) => m.type === "venta");
  const todaysSentSales = pendingMode ? todaysSales : todaysSales.filter((m) => m.sent);
  const todaysPendingSales = pendingMode ? [] : todaysSales.filter((m) => !m.sent);
  const unitsSold = todaysSentSales.reduce((sum, m) => sum + m.qty, 0);
  const billedSales = pendingMode ? billedMovements.filter((m) => m.type === "venta") : [];
  const billedUnits = billedSales.reduce((sum, m) => sum + m.qty, 0);
  const dayRevenue = todaysSentSales.reduce((sum, m) => sum + m.qty * (m.unitPrice || 0), 0);
  const dayRevenueUSD = convertToUSD(dayRevenue, exchangeRate);
  // En el resumen pendiente las reservas de mañana no están comprometidas: sin
  // includeUncommitted el HL pendiente daba siempre 0.00.
  // Con productos marcados como cerveza o malta (goals.js), el HL de hoy y los
  // blísteres cuentan solo esos; sin ninguno marcado queda como siempre.
  const goalProductCount = products.filter((p) => !p.archived && isGoalProduct(p)).length;
  const useGoalProducts = !pendingMode && goalProductCount > 0;
  const goalSums = useGoalProducts ? goalTotals(todaysSentSales, products) : null;
  const hlSoldToday = useGoalProducts
    ? goalSums.hl
    : totalHlSold(todaysSentSales, products, { includeUncommitted: pendingMode });
  const hasBlisterGoal = typeof blisterGoal === "number" && Number.isFinite(blisterGoal) && blisterGoal > 0;
  const blisterPct = useGoalProducts && hasBlisterGoal ? Math.round((goalSums.blisters / blisterGoal) * 100) : null;
  // % contra la meta diaria (Productos) -- solo tiene sentido con lo
  // realmente vendido/comprometido, no con lo pendiente sin enviar todavía.
  // Solo con una meta numérica positiva: un respaldo importado con otro tipo
  // de dato ahí no debe mostrar "NaN%".
  const hasDailyGoal = typeof dailyHlGoal === "number" && Number.isFinite(dailyHlGoal) && dailyHlGoal > 0;
  const dailyHlPct = !pendingMode && hasDailyGoal ? Math.round((hlSoldToday / dailyHlGoal) * 100) : null;
  const ordersToday = new Set(todaysSentSales.filter((m) => m.orderId).map((m) => m.orderId)).size;

  const activeProducts = products.filter((p) => !p.archived);
  const allRows = activeProducts
    .map((p) => ({
      product: p,
      soldToday: todaysSentSales.filter((m) => m.code === p.code).reduce((sum, m) => sum + m.qty, 0),
      pendingToday: todaysPendingSales.filter((m) => m.code === p.code).reduce((sum, m) => sum + m.qty, 0),
      billedTomorrow: billedSales.filter((m) => m.code === p.code).reduce((sum, m) => sum + m.qty, 0),
      stockLeft: stock[p.code] || 0,
    }))
    // disponibleLibre = stockLeft menos lo reservado en pedidos de mañana
    // sin enviar -- no stockLeft - pendingToday: un pedido de hoy sin enviar
    // YA está comprometido (confirmOrder resta stock al crearlo, sin
    // importar si se envió), así que restar pendingToday de nuevo acá
    // descontaba las mismas unidades dos veces. Pero sí hay que restar lo
    // reservado para mañana -- ese stock físico sigue ahí pero ya está
    // prometido a otro cliente, no es libre de verdad.
    .map((row) => ({ ...row, disponibleLibre: Math.max(0, row.stockLeft - reservedForTomorrow(allOrders, row.product.code)) }))
    .sort((a, b) => b.soldToday - a.soldToday);
  // Solo se muestran productos con alguna actividad hoy (vendido o
  // pendiente sin enviar) -- uno sin movimientos no aporta nada al resumen,
  // solo ruido en la lista.
  const rows = allRows.filter((row) => row.soldToday > 0 || row.pendingToday > 0 || row.billedTomorrow > 0);

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
          <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}><AnimatedNumber value={unitsSold} /></div>
          {billedUnits > 0 && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              {`${billedUnits} facturada${billedUnits === 1 ? "" : "s"} · ${unitsSold + billedUnits} en total`}
            </div>
          )}
        </div>

        {showPrices && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.06em", marginBottom: 4 }}>{pendingMode ? "INGRESO PENDIENTE" : "INGRESO DEL DÍA"}</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}><AnimatedNumber value={dayRevenue} format={formatCUP} decimals={2} /></div>
            {dayRevenueUSD !== null && (
              <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{formatUSD(dayRevenueUSD)}</div>
            )}
          </div>
        )}

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.06em", marginBottom: 4 }}>{ordersLabel}</div>
          <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}><AnimatedNumber value={ordersToday} /></div>
        </div>

        {useGoalProducts && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.06em", marginBottom: 4 }}>BLÍSTERES</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}><AnimatedNumber value={goalSums.blisters} /></div>
            {blisterPct !== null && (
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{blisterPct}% de la meta diaria</div>
            )}
          </div>
        )}

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.06em", marginBottom: 4 }}>HL {pendingMode ? "PENDIENTES" : useGoalProducts ? "CERVEZA Y MALTA" : "VENDIDOS"}</div>
          <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}><AnimatedNumber value={hlSoldToday} decimals={2} format={(n) => n.toFixed(2)} /></div>
          {dailyHlPct !== null && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{dailyHlPct}% de la meta diaria</div>
          )}
        </div>
      </div>

      <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "var(--text-muted)", fontWeight: 600, marginBottom: 10 }}>
        POR PRODUCTO
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 13.5, color: "var(--text-faint)", padding: "10px 2px" }}>
          {activeProducts.length === 0 ? "Sin productos activos." : pendingMode ? "Sin pendientes hoy." : "Aún no hay ventas hoy."}
        </div>
      ) : (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          {rows.map((row, i) => (
            <div
              key={row.product.code}
              onClick={onProductClick ? () => onProductClick(row.product.code) : undefined}
              className={onProductClick ? "pressable" : undefined}
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
                {row.billedTomorrow > 0 && (
                  <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                    Facturado: <span style={{ fontWeight: 700, color: "var(--green)", fontVariantNumeric: "tabular-nums" }}>{row.billedTomorrow}</span>
                  </span>
                )}
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
