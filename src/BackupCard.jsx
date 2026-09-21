import { useState } from "react";
import { ShieldCheck, ShieldAlert, Share2, Download, Upload } from "lucide-react";
import { daysSince } from "./dateUtils";

function lastBackupText(lastBackupAt) {
  if (!lastBackupAt) return "Todavía no has hecho ningún respaldo.";
  const days = daysSince(lastBackupAt);
  if (days <= 0) return "Último respaldo: hoy.";
  return `Último respaldo: hace ${days} día${days === 1 ? "" : "s"}.`;
}

function formatCopyDate(iso) {
  try {
    return new Date(iso).toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

const OUTLINE_BUTTON = {
  display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", boxSizing: "border-box",
  background: "transparent", border: "1px solid var(--border-strong)", color: "var(--text)",
  borderRadius: 8, padding: "10px 14px", fontSize: 13.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
};

// Tarjeta de Configuración con todo lo relativo a no perder los datos:
// estado del almacenamiento, respaldo (compartir/guardar/importar) y la copia
// automática de ayer.
export default function BackupCard({
  storageProtected, lastBackupAt, reminderDays, movementsCount, customersCount,
  onShare, onDownload, onImport, autoCopyAt, onRestoreCopy,
}) {
  const [sharing, setSharing] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);

  async function handleShare() {
    if (sharing) return;
    setSharing(true);
    try {
      await onShare();
    } finally {
      setSharing(false);
    }
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", marginBottom: 14 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}>Datos y respaldo</div>

      {storageProtected === true && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
          <ShieldCheck size={18} color="var(--accent-green-text)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12.5 }}>
            <div style={{ fontWeight: 600, color: "var(--accent-green-text)" }}>Almacenamiento protegido</div>
            <div style={{ color: "var(--text-muted)" }}>El dispositivo no borrará tus datos por falta de espacio.</div>
          </div>
        </div>
      )}
      {storageProtected === false && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
          <ShieldAlert size={18} color="var(--warning-text)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12.5 }}>
            <div style={{ fontWeight: 600, color: "var(--warning-text)" }}>Almacenamiento no garantizado</div>
            <div style={{ color: "var(--text-muted)" }}>El navegador podría borrar los datos si falta espacio. Comparte un respaldo seguido.</div>
          </div>
        </div>
      )}

      <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 12 }}>
        {lastBackupText(lastBackupAt)} Hay {movementsCount} movimiento{movementsCount === 1 ? "" : "s"} y {customersCount} cliente{customersCount === 1 ? "" : "s"}. Te lo recordaremos cada {reminderDays} días.
      </div>

      <button
        onClick={handleShare}
        disabled={sharing}
        style={{ ...OUTLINE_BUTTON, background: "var(--ink)", color: "var(--cream)", border: "none", opacity: sharing ? 0.7 : 1 }}
      >
        <Share2 size={15} />
        Compartir respaldo
      </button>
      <div style={{ fontSize: 12, color: "var(--text-muted)", margin: "6px 0 10px", textAlign: "center" }}>
        Envíalo a Drive, WhatsApp o correo para tenerlo fuera del teléfono.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button onClick={onDownload} style={OUTLINE_BUTTON}>
          <Download size={15} />
          Guardar en el teléfono
        </button>
        <button onClick={onImport} style={OUTLINE_BUTTON}>
          <Upload size={15} />
          Importar respaldo
        </button>
      </div>

      {autoCopyAt && (
        <div style={{ borderTop: "1px solid var(--hairline)", marginTop: 14, paddingTop: 12 }}>
          {!confirmRestore ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                Copia automática del estado anterior: {formatCopyDate(autoCopyAt)}
              </span>
              <button
                onClick={() => setConfirmRestore(true)}
                style={{ flexShrink: 0, background: "none", border: "none", color: "var(--accent-orange-text)", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", padding: "4px 2px" }}
              >
                Restaurar
              </button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12.5, color: "var(--warning-text)", marginBottom: 8 }}>
                Vas a reemplazar los datos actuales por la copia del {formatCopyDate(autoCopyAt)}. Los cambios hechos después se pierden.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setConfirmRestore(false)}
                  style={{ ...OUTLINE_BUTTON, padding: "8px 12px", fontSize: 13 }}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => { setConfirmRestore(false); onRestoreCopy(); }}
                  style={{ ...OUTLINE_BUTTON, padding: "8px 12px", fontSize: 13, background: "var(--danger)", color: "var(--on-accent)", border: "none" }}
                >
                  Sí, restaurar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
