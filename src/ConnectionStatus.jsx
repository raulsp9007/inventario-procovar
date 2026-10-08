import { formatDateTime } from "./dateUtils";

// Indicador de conexión/actualización: deja claro de un vistazo si lo que se
// ve es lo último o no. Con una versión nueva esperando, el botón "Actualizar
// ahora" (si se pasa onUpdate) la aplica -- sirve aunque se haya cerrado la
// barra de arriba. Prioridad: sin conexión > hay actualización esperando > al
// día -- son excluyentes entre sí, siempre se muestra uno solo.
export default function ConnectionStatus({ offline, updateAvailable, lastOnlineAt, onUpdate, version }) {
  const variant = offline ? "offline" : updateAvailable ? "update" : "ok";
  const copy = {
    offline: {
      color: "var(--call-blue)",
      title: "Sin conexión",
      subtitle: lastOnlineAt
        ? `Usando la última versión guardada (desde ${formatDateTime(lastOnlineAt)}).`
        : "Usando la última versión guardada.",
    },
    update: {
      color: "var(--warning-text)",
      title: "Hay una versión nueva",
      subtitle: "Actualiza cuando termines lo que haces.",
    },
    ok: {
      color: "var(--accent-green-text)",
      title: "App actualizada",
      subtitle: lastOnlineAt ? `Última conexión: ${formatDateTime(lastOnlineAt)}.` : "",
    },
  }[variant];

  return (
    <div
      style={{
        display: "flex", gap: 10, alignItems: "flex-start", background: "var(--surface)",
        border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", marginBottom: 14,
      }}
    >
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: copy.color, flexShrink: 0, marginTop: 4 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>{copy.title}</div>
        {copy.subtitle && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{copy.subtitle}</div>}
        {version && <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>Versión {version}</div>}
      </div>
      {variant === "update" && onUpdate && (
        <button
          type="button"
          onClick={onUpdate}
          style={{
            flexShrink: 0, height: 32, padding: "0 12px", borderRadius: 8, border: "1px solid var(--text)",
            background: "transparent", color: "var(--text)", fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
          }}
        >
          Actualizar ahora
        </button>
      )}
    </div>
  );
}
