// Cuánto dura la animación de salida de un pedido (ver .orderleave en
// theme.css) antes de aplicar de verdad el borrado/posposición. 0 = sin
// animación: con "reducir movimiento" del sistema, o si el entorno no
// puede decirlo (sin matchMedia, p. ej. los tests), así nada se demora.
export const LEAVE_ANIMATION_MS = 260;

export function leaveAnimationMs() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return 0;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : LEAVE_ANIMATION_MS;
}
