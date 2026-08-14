# Diseño: "Disponible libre" por producto en pestaña Hoy

**Fecha:** 2026-08-14
**Estado:** Aprobado, implementación directa (sin plan formal)

## Qué

Se mantiene el modelo actual: el stock se descuenta al confirmar el pedido, no al marcarlo "Enviado" (`Pendiente` ya representa unidades comprometidas en pedidos de hoy sin enviar, ya restadas del stock).

Se agrega un dato nuevo por producto en `Today.jsx`, "POR PRODUCTO": **Disponible libre** = `stockLeft - pendingToday`. Responde "cuánto puedo prometerle a un cliente nuevo ahora mismo, sin contar lo ya comprometido en pedidos de hoy sin enviar".

Se muestra solo cuando `pendingToday > 0` (si no hay pendientes, Disponible libre == Stock, sería redundante mostrarlo).

## Verificación manual

1. Producto sin pedidos pendientes hoy → no aparece "Disponible libre" (solo Vendido hoy / Stock).
2. Producto con Stock 97 y Pendiente 5 → Disponible libre muestra 92.
3. Marcar el pedido pendiente como Enviado → Pendiente baja a 0, Disponible libre desaparece (ya no aporta info nueva).
