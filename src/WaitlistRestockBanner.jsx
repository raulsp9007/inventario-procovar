import { BellRing, X } from "lucide-react";
import { customerLabel } from "./nameLabels";

// Aviso al reponer un producto que estaba en 0 y tiene clientes en lista de
// espera. Cada cliente se puede convertir en un pedido real (abre Nuevo
// pedido ya cargado, mismo sistema de pedidos de siempre) o quitar de la
// lista. Si un cliente se atiende, sale de la lista y el aviso se actualiza.
export default function WaitlistRestockBanner({ alerts, waitlist, products, stock, onMakeOrder, onRemove, onDismiss }) {
  const cards = alerts
    .map((alert) => {
      const entries = waitlist
        .filter((w) => w.code === alert.code)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return { alert, entries, product: products.find((p) => p.code === alert.code) };
    })
    .filter((c) => c.entries.length > 0 && c.product);

  if (cards.length === 0) return null;

  return (
    <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
      {cards.map(({ alert, entries, product }) => {
        const totalWanted = entries.reduce((sum, w) => sum + w.qty, 0);
        // Contra el stock de AHORA, no el de cuando repusiste: a medida que
        // haces pedidos, el stock baja y el "alcanza" tiene que seguirlo.
        const inStock = stock[alert.code] || 0;
        const enough = inStock >= totalWanted;
        return (
          <div
            key={alert.code}
            style={{
              background: "var(--banner-warning-bg)", border: "1px solid var(--border-warn)", color: "var(--warning-text)",
              borderRadius: 12, padding: "12px 14px",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", minWidth: 0 }}>
                <BellRing size={17} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Repusiste {product.name}</div>
                  <div style={{ fontSize: 12, marginTop: 2, opacity: 0.9 }}>
                    Hay {entries.length} cliente{entries.length === 1 ? "" : "s"} en espera
                  </div>
                </div>
              </div>
              <button
                onClick={() => onDismiss(alert.code)}
                aria-label="Cerrar aviso"
                title="Cerrar aviso"
                style={{ flexShrink: 0, background: "transparent", border: "none", color: "inherit", cursor: "pointer", padding: 2, display: "flex" }}
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>

            <div style={{ marginTop: 10, borderTop: "1px solid var(--border-warn)" }}>
              {entries.map((w, i) => (
                <div
                  key={w.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "8px 0",
                    borderTop: i === 0 ? "none" : "1px solid var(--border-warn)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>
                    <span style={{ fontWeight: 600 }}>{customerLabel(w.customerName)}</span>
                    <span style={{ marginLeft: 6, fontVariantNumeric: "tabular-nums" }}>x{w.qty}</span>
                  </div>
                  <button
                    onClick={() => onMakeOrder(w)}
                    style={{
                      flexShrink: 0, background: "var(--ink)", color: "var(--cream)", border: "none",
                      borderRadius: 7, padding: "7px 10px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    Hacer pedido
                  </button>
                  <button
                    onClick={() => onRemove(w.id)}
                    style={{
                      flexShrink: 0, background: "transparent", color: "inherit", border: "1px solid var(--border-warn)",
                      borderRadius: 7, padding: "7px 10px", fontSize: 12.5, fontWeight: 500, cursor: "pointer",
                    }}
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 6, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
              Piden {totalWanted} en total · en stock {inStock}
              {enough ? " · alcanza" : ` · faltan ${totalWanted - inStock}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}
