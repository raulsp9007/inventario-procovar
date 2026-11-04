import { RefreshCw } from "lucide-react";

// Barra de Pedidos: botón "Comprobar" para ver al momento si la facturadora ya confirmó
// los pedidos enviados a facturación (la app también comprueba sola cada hora); la
// lógica vive en useCloudSync (cloud = lo que ese hook devuelve).

const pad = (n) => String(n).padStart(2, "0");
const clock = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const plural = (n, one, many) => (n === 1 ? one : many);

export function checkText(cloud) {
  if (cloud.checking) return "Comprobando…";
  if (cloud.closedMessage) return cloud.closedMessage;
  if (cloud.phase === "offline" || cloud.phase === "auth" || cloud.phase === "error") return cloud.message;
  if (!cloud.lastCheck) return "Mira si la facturadora ya confirmó tus pedidos (también se comprueba solo cada hora).";
  const { at, confirmed, unconfirmed } = cloud.lastCheck;
  const news = [];
  if (confirmed > 0) news.push(`${confirmed} ${plural(confirmed, "pedido confirmado", "pedidos confirmados")}`);
  if (unconfirmed > 0) news.push(`${unconfirmed} ${plural(unconfirmed, "pedido vuelto a pendiente", "pedidos vueltos a pendiente")}`);
  return `Comprobado a las ${clock(at)} · ${news.length > 0 ? news.join(" · ") : "sin novedades"}`;
}

export default function CloudCheckBar({ cloud }) {
  if (!cloud.link || !cloud.enabled) return null;
  const problem = !cloud.checking && (cloud.phase === "offline" || cloud.phase === "auth" || cloud.phase === "error" || !!cloud.closedMessage);
  return (
    <div
      role="group"
      aria-label="Comprobar confirmaciones"
      style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface-subtle)", border: "1px solid var(--border)", borderRadius: 12, padding: "8px 10px", marginBottom: 12 }}
    >
      <button
        type="button"
        onClick={cloud.syncNow}
        disabled={cloud.checking}
        style={{
          flexShrink: 0, display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px", borderRadius: 9, border: "none",
          background: "var(--ink)", color: "var(--cream)", fontSize: 13.5, fontWeight: 700, fontFamily: "inherit", cursor: cloud.checking ? "default" : "pointer",
        }}
      >
        <RefreshCw size={14} strokeWidth={2.4} aria-hidden="true" />
        Comprobar
      </button>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: problem ? "var(--error-text)" : "var(--text-muted)", overflowWrap: "anywhere" }}>
        {checkText(cloud)}
      </span>
    </div>
  );
}
