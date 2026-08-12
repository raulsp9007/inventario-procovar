import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { formatDate } from "./dateUtils";
import { formatCUP } from "./money";
import { getCustomerStats, getCustomerOrders } from "./customerHelpers";

function sortStats(stats, sortBy) {
  const sorted = [...stats];
  if (sortBy === "name") {
    sorted.sort((a, b) => a.customerName.localeCompare(b.customerName, "es"));
  } else if (sortBy === "oldest") {
    sorted.sort((a, b) => a.lastPurchaseDate.localeCompare(b.lastPurchaseDate));
  } else {
    sorted.sort((a, b) => b.lastPurchaseDate.localeCompare(a.lastPurchaseDate));
  }
  return sorted;
}

export default function Customers({ products, movements, showPrices }) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [expandedCustomer, setExpandedCustomer] = useState(null);

  const allStats = getCustomerStats(movements, products);
  const filtered = search.trim()
    ? allStats.filter((c) => c.customerName.toLowerCase().includes(search.trim().toLowerCase()))
    : allStats;
  const stats = sortStats(filtered, sortBy);

  return (
    <div>
      <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "#8A8574", fontWeight: 600, marginBottom: 10 }}>
        CLIENTES
      </div>

      {allStats.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          <input
            type="text"
            placeholder="Buscar cliente"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: "1 1 auto", minWidth: 160, border: "1px solid #E7E2D3", borderRadius: 7,
              padding: "9px 12px", fontSize: 14, boxSizing: "border-box",
            }}
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              flex: "0 0 auto", border: "1px solid #E7E2D3", borderRadius: 7,
              padding: "9px 10px", fontSize: 13.5, background: "#FFFFFF",
            }}
          >
            <option value="recent">Última compra: reciente primero</option>
            <option value="oldest">Última compra: antigua primero</option>
            <option value="name">Nombre (A-Z)</option>
          </select>
        </div>
      )}

      {allStats.length === 0 ? (
        <div style={{ fontSize: 13.5, color: "#9A9484", padding: "10px 2px" }}>
          Aún no hay clientes registrados.
        </div>
      ) : stats.length === 0 ? (
        <div style={{ fontSize: 13.5, color: "#9A9484", padding: "10px 2px" }}>
          Ningún cliente coincide con "{search}".
        </div>
      ) : (
        <div style={{ background: "#FFFFFF", border: "1px solid #E7E2D3", borderRadius: 12, overflow: "hidden" }}>
          {stats.map((c, i) => {
            const product = products.find((p) => p.code === c.favoriteProductCode);
            const isExpanded = expandedCustomer === c.customerName;
            const orders = isExpanded ? getCustomerOrders(movements, c.customerName) : [];
            return (
              <div
                key={c.customerName}
                style={{ borderTop: i === 0 ? "none" : "1px solid #F0EDE2" }}
              >
                <div
                  onClick={() => setExpandedCustomer(isExpanded ? null : c.customerName)}
                  style={{
                    display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center",
                    gap: 6, padding: "12px 16px", fontSize: 13.5, cursor: "pointer",
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{c.customerName}</span>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", color: "#8A8574", fontSize: 12.5 }}>
                    <span>{product ? product.short : c.favoriteProductCode}</span>
                    <span>{formatDate(c.lastPurchaseDate)}</span>
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ borderTop: "1px solid #F0EDE2", padding: "8px 16px 12px", background: "#FBFAF6" }}>
                    {orders.map((order, oi) => {
                      const total = order.lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
                      return (
                        <div
                          key={order.orderId}
                          style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            gap: 8, padding: "8px 0", borderTop: oi === 0 ? "none" : "1px solid #F0EDE2",
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 12.5 }}>
                              {order.isDelivery ? "🛺 " : ""}{formatDate(order.date)}
                            </div>
                            <div style={{ fontSize: 11.5, color: "#8A8574" }}>
                              {order.lines.map((line) => {
                                const lp = products.find((p) => p.code === line.code);
                                return `${line.qty}x ${lp ? lp.short : line.code}`;
                              }).join(", ")}
                            </div>
                          </div>
                          {showPrices && (
                            <div style={{ fontSize: 12.5, fontWeight: 600, flexShrink: 0 }}>{formatCUP(total)}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
