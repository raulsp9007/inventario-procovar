import { COLORS } from "./tokens";

// Contenedor blanco redondeado repetido a mano en casi todas las listas
// (productos, pedidos, clientes, movimientos).
export default function Card({ children, style, warn }) {
  return (
    <div
      style={{
        background: COLORS.surface,
        border: `1px solid ${warn ? COLORS.borderWarn : COLORS.border}`,
        borderRadius: 12,
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
