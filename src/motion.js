// Cuánto dura la animación de salida de un pedido (ver .orderleave en
// theme.css) antes de aplicar de verdad el borrado/posposición. 0 = sin
// animación: con "reducir movimiento" del sistema, o si el entorno no
// puede decirlo (sin matchMedia, p. ej. los tests), así nada se demora.
export const LEAVE_ANIMATION_MS = 260;

export function leaveAnimationMs() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return 0;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : LEAVE_ANIMATION_MS;
}

// Cuánto tarda en llenarse un indicador de meta (GoalRing). Misma regla: 0 =
// sin animación (reducir movimiento, o sin matchMedia como en los tests).
export const FILL_ANIMATION_MS = 1100;

export function fillAnimationMs() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return 0;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : FILL_ANIMATION_MS;
}

// Cuánto se resalta un pedido recién creado (.orderenter en theme.css).
export const ENTER_ANIMATION_MS = 1400;

export function enterAnimationMs() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return 0;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : ENTER_ANIMATION_MS;
}

// Entrada escalonada (.rise en theme.css): cada tarjeta se retrasa un poco más
// que la anterior; con tope, para que una lista larga no tarde en aparecer.
export const RISE_MAX_INDEX = 8;

export function riseStyle(index) {
  return { "--i": Math.min(index, RISE_MAX_INDEX) };
}
