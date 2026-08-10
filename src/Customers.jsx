import { formatDate } from "./dateUtils";
import { getCustomerStats } from "./customerHelpers";

export default function Customers({ products, movements }) {
  const stats = getCustomerStats(movements, products);

  return (
    <div>
      <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "#8A8574", fontWeight: 600, marginBottom: 10 }}>
        CLIENTES
      </div>

      {stats.length === 0 ? (
        <div style={{ fontSize: 13.5, color: "#9A9484", padding: "10px 2px" }}>
          Aún no hay clientes registrados.
        </div>
      ) : (
        <div style={{ background: "#FFFFFF", border: "1px solid #E7E2D3", borderRadius: 12, overflow: "hidden" }}>
          {stats.map((c, i) => {
            const product = products.find((p) => p.code === c.favoriteProductCode);
            return (
              <div
                key={c.customerName}
                style={{
                  display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center",
                  gap: 6, padding: "12px 16px", fontSize: 13.5,
                  borderTop: i === 0 ? "none" : "1px solid #F0EDE2",
                }}
              >
                <span style={{ fontWeight: 600 }}>{c.customerName}</span>
                <div style={{ display: "flex", gap: 12, alignItems: "center", color: "#8A8574", fontSize: 12.5 }}>
                  <span>{product ? product.short : c.favoriteProductCode}</span>
                  <span>{formatDate(c.lastPurchaseDate)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
