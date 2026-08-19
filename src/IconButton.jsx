import { COLORS } from "./tokens";

const VARIANT_STYLE = {
  default: { background: "transparent", color: COLORS.textMuted, border: `1px solid ${COLORS.border}` },
  dark: { background: COLORS.textDark, color: COLORS.cream, border: "none" },
  success: { background: COLORS.whatsapp, color: "#FFFFFF", border: "none" },
  danger: { background: COLORS.danger, color: "#FFFFFF", border: "none" },
};

// Botón cuadrado de ícono, mismo patrón repetido a mano en Orders/
// ProductsView/Customers (Aplazar/Editar/Enviar/Eliminar/Restaurar/etc.).
export default function IconButton({ icon, onClick, title, variant = "default", size = 40, disabled, style }) {
  const v = VARIANT_STYLE[variant] || VARIANT_STYLE.default;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: size, height: size, borderRadius: 7, flexShrink: 0,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        ...v,
        ...style,
      }}
    >
      {icon}
    </button>
  );
}
