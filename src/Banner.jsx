const VARIANTS = {
  warning: { background: "#FBEFE0", border: "#E9CFA0", text: "#8A5A1E" },
  error: { background: "#FBE4E0", border: "#E9A79C", text: "#8A2E1E" },
  dark: { background: "#22261F", border: "#22261F", text: "#F7F4EC" },
};

const BUTTON_KIND = {
  primary: (v) => ({ background: v.text, color: "#FFFFFF", border: "none", fontWeight: 600 }),
  dark: () => ({ background: "#22261F", color: "#F7F4EC", border: "none", fontWeight: 600 }),
  danger: () => ({ background: "#B4291E", color: "#FFFFFF", border: "none", fontWeight: 600 }),
  // Sobre fondo oscuro (variant "dark") el borde normal (v.border) es del
  // mismo color que el fondo y queda invisible -- se usa un contorno claro.
  secondary: (v, variantName) => variantName === "dark"
    ? { background: "transparent", color: "#F7F4EC", border: "1px solid #F7F4EC", fontWeight: 500 }
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
