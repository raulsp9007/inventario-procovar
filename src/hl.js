import { getFormat } from "./productFormats";
import { isCommittedMovement } from "./orderHelpers";

// "HL por unidad" de un producto es el de UNA unidad (una botella). Lo que se
// vende y se cuenta es el formato completo (un sixpack = 6 unidades), así que
// el HL de cada venta es cantidad x HL de la unidad x unidades del formato.
// Cada venta guarda ya ese HL del formato completo en `unitHl` (igual que
// guarda el precio del formato), y todo lo demás -- HL vendidos, acumulado,
// metas -- sigue siendo cantidad x unitHl.

const round6 = (n) => Math.round(n * 1e6) / 1e6;

// Unidades del formato del producto; 1 si no tiene formato o ya no existe.
export function formatUnits(product, formats) {
  const format = product ? getFormat(formats, product.format) : null;
  return format && format.units > 0 ? format.units : 1;
}

// HL de un formato completo (lo que se guarda en `unitHl` al vender).
export function hlPerFormat(product, formats) {
  const hl = Number(product?.hl) || 0;
  return round6(hl * formatUnits(product, formats));
}

// Migración única del historial: las ventas guardadas antes de este cambio
// tienen el HL de UNA unidad en `unitHl`; se multiplica por las unidades del
// formato de su producto. Respeta el HL que tenía cada venta (no el de hoy), y
// una sin HL guardado (null) toma el del producto. Las que tienen 0 (vendidas
// antes de definirle HL al producto) quedan en 0, para el relleno a pedido.
// `hlDelta` es lo que cambia en el acumulado: solo ventas comprometidas, igual
// que cuenta el acumulado. Devuelve el mismo arreglo si no hay nada que cambiar.
export function migrateHlToFormat(movements, products, formats) {
  const byCode = new Map(products.map((p) => [p.code, p]));
  let changed = false;
  let hlDelta = 0;
  const next = movements.map((m) => {
    if (m.type !== "venta") return m;
    const product = byCode.get(m.code);
    const units = formatUnits(product, formats);
    if (units <= 1) return m;
    let updated;
    if (m.unitHl == null) {
      if (!(Number(product?.hl) > 0)) return m;
      updated = round6(product.hl * units);
    } else if (m.unitHl > 0) {
      updated = round6(m.unitHl * units);
    } else {
      return m;
    }
    changed = true;
    if (isCommittedMovement(m)) hlDelta += m.qty * (updated - (m.unitHl || 0));
    return { ...m, unitHl: updated };
  });
  return { movements: changed ? next : movements, hlDelta };
}
