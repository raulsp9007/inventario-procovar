const VARIANTS = {
  warning: { background: "var(--banner-warning-bg)", border: "var(--border-warn)", text: "var(--warning-text)" },
  error: { background: "var(--banner-error-bg)", border: "var(--error-border)", text: "var(--error-text)" },
  dark: { background: "var(--ink)", border: "var(--ink)", text: "var(--cream)" },
};

const BUTTON_KIND = {
  primary: (v) => ({ background: v.text, color: "var(--on-accent)", border: "none", fontWeight: 600 }),
  dark: () => ({ background: "var(--ink)", color: "var(--cream)", border: "none", fontWeight: 600 }),
  danger: () => ({ background: "var(--danger)", color: "var(--on-accent)", border: "none", fontWeight: 600 }),
  // Sobre fondo oscuro (variant "dark") el borde normal (v.border) es del
  // mismo color que el fondo y queda invisible -- se usa un contorno claro.
  secondary: (v, variantName) => variantName === "dark"
    ? { background: "transparent", color: "var(--cream)", border: "1px solid var(--cream)", fontWeight: 500 }
    : { background: "transparent", color: v.text, border: `1px solid ${v.border}`, fontWeight: 500 },
};

// Aviso inline reutilizable (no flotante) -- mismo estilo que ya se usaba
// repetido a mano en varios lugares (error, aviso de stock/pedido grande,
// confirmar import, deshacer borrado). `layout="row"` pone mensaje y
// acciones en una sola fila (para toasts cortos); por default van apiladas.
export default function Banner({ variant = "warning", actions, layout = "stack", style, children }) {
  const v = VARIANTS[variant] || VARIANTS.warning;
  const row = layout === "row";
  return (
    <div
      style={{
        background: v.background, border: `1px solid ${v.border}`, color: v.text,
        borderRadius: 8, padding: "10px 14px", fontSize: 13.5,
        display: row ? "flex" : "block",
        justifyContent: row ? "space-between" : undefined,
        alignItems: row ? "center" : undefined,
        gap: row ? 10 : undefined,
        ...style,
      }}
    >
      <div>{children}</div>
      {actions && actions.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginTop: row ? 0 : 10, flexShrink: 0 }}>
          {actions.map((a, i) => (
            <button
              key={i}
              onClick={a.onClick}
              style={{
                ...BUTTON_KIND[a.kind || "secondary"](v, variant),
                borderRadius: 7, padding: "7px 12px", fontSize: 12.5, cursor: "pointer", flexShrink: 0,
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
