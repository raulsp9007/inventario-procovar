import useAnimatedNumber from "./useAnimatedNumber.js";
import { fillAnimationMs } from "./motion.js";

// Cifra que cuenta hacia arriba hasta su valor al aparecer y al cambiar (igual
// que los anillos de meta). `format` arma el texto final (p. ej. formatCUP);
// mientras cuenta se redondea a `decimals` para no mostrar decimales sueltos.
// El último cuadro es siempre el valor exacto.
export default function AnimatedNumber({ value, format = String, decimals = 0 }) {
  const target = Number(value) || 0;
  const shown = useAnimatedNumber(target, fillAnimationMs());
  // Si el valor final es entero, mientras cuenta tampoco se muestran decimales.
  const factor = Math.pow(10, Number.isInteger(target) ? 0 : decimals);
  const current = shown === target ? target : Math.round(shown * factor) / factor;
  return <>{format(current)}</>;
}
