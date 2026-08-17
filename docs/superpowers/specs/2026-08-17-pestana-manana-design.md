# Diseño: pestaña "Mañana" + "Hoy" vuelve a fecha calendario literal

**Fecha:** 2026-08-17
**Estado:** Aprobado, implementación directa (sin plan formal)

## Qué cambia

Antes, "Hoy" (`Today.jsx`) usaba `businessDayStr()` (día hábil con corte 4pm) — después de las 4pm, la pestaña "se convertía" en mañana. Ahora se separa en dos pestañas fijas:

- **Hoy**: siempre fecha calendario literal (`todayStr()`), sin importar la hora. Muestra lo vendido/pendiente hasta antes de las 4pm (los pedidos de después de las 4pm ya no se estampan con la fecha de hoy — ver abajo).
- **Mañana** (nueva pestaña, mismo lugar en la barra, justo después de Hoy): fecha calendario de mañana (`tomorrowStr()`, nuevo helper en `dateUtils.js`). Recoge los pedidos confirmados después de las 4pm, que ya se estampaban con la fecha de mañana desde el cambio de "día hábil" anterior — **no se toca ese mecanismo**, solo se le da una vista propia en vez de compartir la pestaña "Hoy".

El stock sigue siendo el mismo contador único global (no partido por día) — se descuenta al confirmar el pedido, sin importar a qué pestaña de fecha caiga.

## Componentes

- `dateUtils.js`: nuevo `tomorrowStr()` (calendario literal +1 día, sin lógica de corte).
- `Today.jsx`: se vuelve genérico — nuevos props opcionales `dateStr` (default `todayStr()`), `title` (default "HOY"), `ordersLabel` (default "PEDIDOS DE HOY"), `soldLabel` (default "Vendido hoy"). Internamente ya no importa `businessDayStr`, vuelve a `todayStr()` como base.
- `Tomorrow.jsx` (nuevo, delgado): envuelve `Today` pasando `dateStr={tomorrowStr()}` + los labels en "mañana" ("MAÑANA", "PEDIDOS DE MAÑANA", "Para mañana"). Cero duplicación de lógica.
- `InventoryApp.jsx`: nueva pestaña "Mañana" en la barra (entre Hoy y Resumen semanal), agregada a `VALID_VIEWS`. El `todaysMovements` usado para el header "VENDIDO HOY" y el badge de stock bajo/pendiente también vuelve a `todayStr()` (antes `businessDayStr()`), para ser consistente con la pestaña Hoy.
- `Orders.jsx` (pestaña Pedidos): también se separa — `today`/`tomorrow` vuelven a fechas calendario literales. "PEDIDOS DE HOY" sigue igual (ahora literal). Se agrega sección nueva "PEDIDOS DE MAÑANA" (solo visible si hay al menos un pedido), entre "Pedidos de hoy" y "Pedidos anteriores" — sin esto, los pedidos de hoy antes de las 4pm hubieran caído en "Pedidos anteriores" apenas pasaran las 4pm (regresión no pedida explícitamente pero necesaria para no romper la vista operativa).
- `WeeklySummary.jsx`: **sin cambios**, sigue usando `businessDayStr()` como límite superior de "esta semana/mes" — los acumulados financieros deben seguir incluyendo lo ya comprometido para mañana, independiente de cómo se etiquete la pestaña.
- El mecanismo de estampado de fecha en `confirmOrder`/`postponeOrder` (`InventoryApp.jsx`) **no se toca** — sigue usando `businessDayStr()` al crear/aplazar pedidos, que es lo que alimenta la pestaña Mañana.

## Verificación manual

1. Pedido confirmado antes de las 4pm → aparece en Hoy (dashboard) y en "Pedidos de hoy". No aparece en Mañana.
2. Pedido confirmado después de las 4pm (simulado) → aparece en Mañana (dashboard, con su propio Vendido/Pendiente/Disponible libre) y en "Pedidos de mañana". No aparece en Hoy ni en "Pedidos de hoy".
3. Stock global sin cambios entre pestañas — la misma cifra de Stock aparece en Hoy y Mañana para un mismo producto.
4. Mobile 375px: barra de pestañas con "Mañana" nueva no rompe el layout, envuelve bien.
