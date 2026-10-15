import { useState } from "react";
import { ChevronDown, MessageCircle, Plus, PhoneOff } from "lucide-react";
import { customerLabel, businessLabel } from "./nameLabels";
import { riseStyle } from "./motion";

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Tarjeta "Para escribir hoy" (Pedidos > Hoy): clientes a los que ya les toca
// comprar según su historial (ver recommendations.js), con lo que suelen pedir.
// Cerrada por defecto; solo muestra y abre WhatsApp / el pedido nuevo cuando la
// persona toca -- la app no escribe ni crea nada sola.
export default function ReorderSuggestions({ items, onWrite, onStartOrder }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, marginBottom: 12, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Para escribir hoy: ${items.length}`}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "11px 14px", background: "none", border: "none",
          fontFamily: "inherit", color: "var(--text)", cursor: "pointer", textAlign: "left",
        }}
      >
        <MessageCircle size={16} strokeWidth={2} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>Para escribir hoy</span>
        <span style={{ fontSize: 12, fontWeight: 700, background: "var(--ink)", color: "var(--cream)", borderRadius: 999, padding: "2px 8px" }}>{items.length}</span>
        <ChevronDown size={16} strokeWidth={2.2} style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
      </button>

      {open && (
        <div style={{ borderTop: "1px solid var(--divider)" }}>
          <div style={{ padding: "8px 14px 2px", fontSize: 12, color: "var(--text-muted)" }}>
            Clientes a los que ya les toca comprar, según cada cuánto piden.
          </div>
          {items.map((item, i) => (
            <div
              key={item.customerName}
              className="rise"
              style={{ ...riseStyle(i), padding: "10px 14px", borderTop: i === 0 ? "none" : "1px solid var(--divider)" }}
            >
              <div style={{ fontSize: 14.5, fontWeight: 600 }}>{customerLabel(item.customerName)}</div>
              {item.businessName && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1 }}>{businessLabel(item.businessName)}</div>}
              <div style={{ fontSize: 12, color: "var(--orange)", fontWeight: 600, marginTop: 4 }}>
                {`suele pedir cada ${plural(item.medianInterval, "día", "días")} · hace ${plural(item.daysSince, "día", "días")}`}
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, margin: "8px 0 0" }}>
                {item.typical.map((l) => (
                  <span key={l.code} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, borderRadius: 999, padding: "3px 9px", background: "var(--chip-bg)", border: `1px solid ${l.lacks ? "var(--orange)" : "var(--border-warn)"}`, color: "var(--orange-text)" }}>
                      {`${l.short} ×${l.qty}`}
                    </span>
                    {l.lacks && <span style={{ fontSize: 11, color: "var(--orange)" }}>quedan {l.stock}</span>}
                  </span>
                ))}
              </div>

              {item.dropped.length > 0 && (
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                  Ya no pide {item.dropped.map((d) => d.short).join(", ")} en sus últimos 3 pedidos.
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                {item.phone ? (
                  <button
                    type="button"
                    onClick={() => onWrite(item)}
                    aria-label={`Escribir a ${item.customerName}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px", borderRadius: 8, border: "none",
                      background: "var(--whatsapp)", color: "#0B2E13", fontSize: 12.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
                    }}
                  >
                    <MessageCircle size={14} strokeWidth={2.4} /> Escribir
                  </button>
                ) : (
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-muted)" }}>
                    <PhoneOff size={14} strokeWidth={2} /> Sin teléfono
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onStartOrder(item)}
                  aria-label={`Armar pedido de ${item.customerName}`}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px", borderRadius: 8,
                    border: "1px solid var(--border-strong)", background: "transparent", color: "var(--text)",
                    fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
                  }}
                >
                  <Plus size={14} strokeWidth={2.4} /> Pedido
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
