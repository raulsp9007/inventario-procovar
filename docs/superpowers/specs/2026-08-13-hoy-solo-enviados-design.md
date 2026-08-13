# Diseño: pestaña Hoy solo cuenta pedidos enviados + "Pendiente" por producto

**Fecha:** 2026-08-13
**Estado:** Aprobado, implementación directa (sin plan formal)

## Qué

`Today.jsx` (pestaña "Hoy") filtra sus estadísticas por `m.sent` en vez de contar todas las ventas del día:

- UNIDADES VENDIDAS, INGRESO DEL DÍA, HL VENDIDOS, PEDIDOS DE HOY → solo movimientos de pedidos con `sent: true`.
- "Stock" restante no cambia (siempre es el stock real, independiente de si el pedido se envió).
- "POR PRODUCTO": "Vendido hoy" pasa a contar solo lo enviado; se agrega "Pendiente: N" por producto = suma de `qty` en movimientos de hoy con `sent` falso (pedidos armados pero no enviados aún).

No se toca `money.js` (totalRevenueInRange/totalHlSold se siguen usando en Resumen semanal sin cambios) — el filtro por `sent` se hace localmente en `Today.jsx` sobre el array de movimientos de hoy antes de sumar.

## Verificación manual

1. Pedido de hoy sin enviar → no suma a "Vendido hoy" ni a ingreso/HL/pedidos, pero sí aparece en "Pendiente" del producto correspondiente.
2. Marcar "Enviado" en ese pedido → pasa de Pendiente a Vendido hoy en tiempo real.
3. Pedido de otro día no afecta nada en la pestaña Hoy (ya filtrado por fecha).
4. Sin pedidos pendientes → Pendiente muestra 0, sin romper layout.
