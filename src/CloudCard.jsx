import { useState } from "react";
import { Cloud } from "lucide-react";

// Tarjeta de Configuración: enlace con la nube de facturación. Presentación y
// formulario; la lógica vive en useCloudSync (cloud = lo que ese hook devuelve).

const cardStyle = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", marginTop: 14 };
const buttonStyle = {
  background: "transparent", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 7, padding: "9px 14px",
  fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
};
const pad = (n) => String(n).padStart(2, "0");
const clock = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export default function CloudCard({ cloud, billToCloud = false, onBillToCloudChange }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function link() {
    setBusy(true);
    setError("");
    try {
      await cloud.linkWith(code);
      setCode("");
    } catch (e) {
      setError(e && e.message ? e.message : "No se pudo enlazar.");
    } finally {
      setBusy(false);
    }
  }

  const statusText = !cloud.enabled
    ? "Sincronización apagada."
    : cloud.phase === "ok" && cloud.lastSyncAt ? `Comprobado a las ${clock(cloud.lastSyncAt)}.`
      : cloud.message || (cloud.phase === "idle" ? "Aún no has comprobado. Pulsa Comprobar." : "");

  return (
    <div role="group" aria-label="Nube de facturación" style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>
        <Cloud size={16} strokeWidth={2} />
        Nube de facturación
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
        Los pedidos que envías a facturación le llegan a la facturadora. Cuando ella los confirma con 👍, pulsa Comprobar (en Pedidos o aquí) y se marcan en tu app (CONF.). Los domicilios no se envían.
      </div>

      {!cloud.link ? (
        <>
          <input
            type="text"
            aria-label="Código de enlace"
            placeholder="Pega el código de enlace"
            value={code}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            onChange={(e) => { setCode(e.target.value); setError(""); }}
            style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--border)", borderRadius: 7, padding: "9px 12px", fontSize: 14, marginBottom: 10 }}
          />
          <button type="button" style={buttonStyle} onClick={link} disabled={busy}>Enlazar</button>
          {error && <div role="alert" style={{ fontSize: 12.5, color: "var(--error-text)", marginTop: 8 }}>{error}</div>}
        </>
      ) : (
        <>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>{`Enlazado como ${cloud.link.name}`}</div>
          {statusText && (
            <div style={{ fontSize: 12.5, color: cloud.phase === "auth" || cloud.phase === "error" ? "var(--error-text)" : "var(--text-muted)", marginBottom: 4 }}>
              {statusText}
            </div>
          )}
          {cloud.pendingCount > 0 && (
            <div style={{ fontSize: 12.5, color: "var(--orange)", marginBottom: 4 }}>
              {cloud.pendingCount} {cloud.pendingCount === 1 ? "envío pendiente" : "envíos pendientes"} de subir.
            </div>
          )}
          {cloud.rejected.length > 0 && (
            <div style={{ fontSize: 12.5, color: "var(--error-text)", marginBottom: 4 }}>
              La nube rechazó {cloud.rejected.length} {cloud.rejected.length === 1 ? "pedido" : "pedidos"}: {cloud.rejected[0].message}
            </div>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, cursor: "pointer", margin: "10px 0" }}>
            <input type="checkbox" checked={cloud.enabled} onChange={(e) => cloud.setEnabled(e.target.checked)} />
            Sincronizar con la facturadora
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={buttonStyle} onClick={cloud.syncNow} disabled={!cloud.enabled || cloud.checking}>Comprobar</button>
            <button type="button" style={buttonStyle} onClick={cloud.unlink}>Desenlazar</button>
          </div>
        </>
      )}

      <div style={{ borderTop: "1px solid var(--divider)", marginTop: 14, paddingTop: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={!!billToCloud}
            onChange={(e) => onBillToCloudChange && onBillToCloudChange(e.target.checked)}
          />
          Facturar a la nube
        </label>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
          Con esto activado, el botón FACT. de un pedido no manda el WhatsApp a la facturadora: solo lo marca como facturado y el pedido sube a la nube. Los domicilios siguen yendo al supervisor por WhatsApp.
        </div>
        {billToCloud && !(cloud.link && cloud.enabled) && (
          <div style={{ fontSize: 12.5, color: "var(--orange)", marginTop: 6 }}>
            Enlaza primero con tu código (y deja la sincronización encendida): mientras tanto, FACT. sigue enviando por WhatsApp para que el pedido no se pierda.
          </div>
        )}
      </div>
    </div>
  );
}
