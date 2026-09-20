import { isCommittedMovement } from "./orderHelpers";

// Cada venta guarda el HL por unidad que tenía el producto AL VENDERLA
// (unitHl), igual que el precio. Las ventas hechas antes de definirle HL al
// producto quedan con 0 y no se recalculan solas al cambiarlo. Esto detecta
// esas ventas para poder rellenarlas a pedido del usuario.
export function isHlBackfillable(m, code) {
  return m.code === code && m.type === "venta" && (m.unitHl == null || m.unitHl === 0);
}

// Qué se rellenaría con el HL por unidad GUARDADO del producto. null si el
// producto no tiene HL o no hay ventas por rellenar. `units`/`hlAdded` solo
// cuentan lo comprometido (lo que ya suma a HL vendidos y al acumulado); un
// pedido de mañana sin enviar también se rellena, pero todavía no suma HL.
export function getHlBackfill(movements, products, code) {
  const hl = products.find((p) => p.code === code)?.hl;
  if (!(hl > 0)) return null;
  let count = 0;
  let units = 0;
  movements.forEach((m) => {
    if (!isHlBackfillable(m, code)) return;
    count += 1;
    if (isCommittedMovement(m)) units += m.qty;
  });
  if (count === 0) return null;
  return { hl, count, units, hlAdded: Math.round(units * hl * 1000) / 1000 };
}
