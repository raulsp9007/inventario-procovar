import { RefreshCw } from "lucide-react";

// Barra fija arriba: avisa que hay una versión nueva descargada. Actualizar la
// aplica (recarga con la versión nueva) y la × la oculta. Nunca recarga la app
// por su cuenta: así no se pierde un formulario a medias.
export default function UpdateBanner({ onUpdate, onDismiss }) {
  return (
    <div
      role="status"
      style={{
        position: "sticky", top: 0, zIndex: 80, display: "flex", alignItems: "center", gap: 10,
        padding: "9px 12px", paddingTop: "calc(9px + env(safe-area-inset-top, 0px))",
        background: "var(--ink)", color: "var(--cream)", borderBottom: "1px solid rgba(255,255,255,.08)",
        boxShadow: "0 2px 8px rgba(0,0,0,.25)",
      }}
    >
      <RefreshCw size={18} strokeWidth={2.2} color="var(--on-ink-accent)" style={{ flexShrink: 0 }} aria-hidden="true" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.2 }}>Hay una versión nueva</div>
        <div style={{ fontSize: 11.5, color: "var(--on-ink-subtitle)", marginTop: 1 }}>Actualiza cuando termines lo que haces.</div>
      </div>
      <button
        type="button"
        onClick={onUpdate}
        style={{
          flexShrink: 0, height: 34, padding: "0 14px", borderRadius: 8, border: "none",
          background: "var(--on-ink-accent)", color: "#22261F", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
        }}
      >
        Actualizar
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Después"
        style={{
          flexShrink: 0, width: 32, height: 32, borderRadius: 8, border: "none", background: "transparent",
          color: "var(--on-ink-subtitle)", fontSize: 20, lineHeight: 1, fontFamily: "inherit", cursor: "pointer",
        }}
      >
        ×
      </button>
    </div>
  );
}
