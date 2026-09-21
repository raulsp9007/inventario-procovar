import { Clock } from "lucide-react";

// Cuántos pedidos de hoy quedaron sin cada paso al llegar el cierre de ventas.
export function PendingCounts({ pending }) {
  const cells = [
    { label: "sin enviar", value: pending.unsentToCustomer },
    { label: "sin facturar", value: pending.unsent },
    { label: "sin confirmar", value: pending.unconfirmed },
  ];
  return (
    <div style={{ display: "flex", gap: 6, margin: "10px 0" }}>
      {cells.map((c) => (
        <div
          key={c.label}
          style={{ flex: 1, border: "1px solid var(--border-warn)", borderRadius: 9, textAlign: "center", padding: "5px 2px", background: "var(--surface)" }}
        >
          <b style={{ display: "block", fontSize: 16, fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{c.value}</b>
          <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{c.label}</span>
        </div>
      ))}
    </div>
  );
}

// Resumen del cierre de ventas para las pestañas donde no está la lista
// detallada (todas menos Pedidos > Hoy): qué quedó pendiente y un botón que
// lleva directo a revisarlo. Presentación pura.
export default function CierrePendientesBanner({ pending, hourLabel, onReview, style }) {
  return (
    <div style={{ background: "var(--banner-bg)", border: "1px solid var(--border-warn)", borderRadius: 12, padding: 14, marginBottom: 16, ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Clock size={16} color="var(--orange)" strokeWidth={2} />
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
          Cierre de ventas{hourLabel ? ` · ${hourLabel}` : ""}
        </span>
      </div>
      <div style={{ fontSize: 13, color: "var(--muted)" }}>
        Hoy quedan pedidos sin cerrar. Los nuevos ya van para mañana.
      </div>
      <PendingCounts pending={pending} />
      <button
        onClick={onReview}
        style={{
          width: "100%", height: 40, borderRadius: 9, border: "none", background: "var(--ink)", color: "var(--cream)",
          fontSize: 13.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
        }}
      >
        Revisar pendientes
      </button>
    </div>
  );
}
