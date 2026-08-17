# Diseño: bloquear doble envío de pedido (evita duplicados)

**Fecha:** 2026-08-17
**Estado:** Aprobado, implementación directa (sin plan formal)

## Bug real encontrado

"Confirmar pedido"/"Guardar cambios" no tenía protección contra doble clic o doble toque. Causa raíz: el estado de React (`customerName`, `editingOrderId`, etc.) se actualiza en batch, no al instante — si dos clics llegan casi juntos (común en touch: un toque que "rebota"), el segundo `confirmOrder()` puede correr leyendo el mismo formulario "todavía lleno" antes de que `resetForm()` haya tomado efecto visualmente. Para un pedido **nuevo**, cada llamada genera su propio `orderId` random en `confirmOrder` de `InventoryApp.jsx` → dos clics = dos pedidos idénticos duplicados. (Para edición no duplica pedidos — mismo `orderId` en ambas llamadas, la segunda pisa a la primera — pero igual vale la pena bloquear el reintento innecesario.)

## Fix

`Orders.jsx` gana `submittingRef` (`useRef`, no `useState` — cambia al instante, no espera a un re-render). Se pone en `true` justo antes de la llamada real a `onConfirmOrder`/`onEditOrder` (en `confirmOrder()` y en `confirmBigOrderAnyway()`), y ambas funciones cortan de entrada si `submittingRef.current` ya es `true`. Se libera recién cuando el formulario **efectivamente se vació** — un `useEffect` con dependencia en `customerName` pone `submittingRef.current = false` cuando `customerName` cambia (pasa a `""` tras `resetForm()`), no antes. Así el segundo clic synthetic (mismo tick, antes del re-render) queda bloqueado con certeza.

## Verificación manual

1. Simulé el doble clic exacto (`btn.click(); btn.click();` en la misma ejecución de JS, sin esperar entre medio) sobre "Confirmar pedido" con un pedido nuevo → solo se creó **un** movimiento/pedido, no dos.
2. Después de un envío normal, confirmar un pedido nuevo distinto funciona sin problema (el guard no queda trabado).
3. Sin errores de consola en ningún caso.
