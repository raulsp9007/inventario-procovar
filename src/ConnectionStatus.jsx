import { formatDateTime } from "./dateUtils";

// Indicador de conexión/actualización -- solo informativo, sin botones: la
// app funciona igual en cualquiera de los tres estados, esto es solo para
// que quede claro de un vistazo si lo que se ve es lo último o no.
// Prioridad: sin conexión > hay actualización esperando > al día -- son
// excluyentes entre sí, siempre se muestra uno solo.
export default function ConnectionStatus({ offline, updateAvailable, lastOnlineAt }) {
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
      subtitle: "Se aplica sola al volver a abrir la app.",
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
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>{copy.title}</div>
        {copy.subtitle && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{copy.subtitle}</div>}
      </div>
    </div>
  );
}
