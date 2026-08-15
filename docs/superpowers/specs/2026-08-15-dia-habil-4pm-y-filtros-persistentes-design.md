# Diseño: día hábil con corte 4pm + filtros/sort persistentes en Pedidos

**Fecha:** 2026-08-15
**Estado:** Aprobado, implementación directa (sin plan formal)

## 1. Filtros/sort persistentes en Pedidos

`todayOrderSort`, `filterUnsent`, `filterUnconfirmed` se guardan en `localStorage` (clave `procovar-pedidos-filtros`, JSON `{sort, filterUnsent, filterUnconfirmed}`), separada de los datos del negocio — no pasa por `applyPersistedData`/backup. Se inicializan leyendo esa clave (lazy `useState`) y se reescriben en cada cambio via `useEffect`. El buscador de texto (`orderSearch`) queda igual, no persiste (sesión).

## 2. Día hábil con corte 4pm

`dateUtils.js` gana `businessDayStr(now = new Date())`: si la hora local del dispositivo es ≥ 16 (4pm), devuelve la fecha de mañana; si no, la de hoy. `todayStr()` (fecha calendario literal) se mantiene sin cambios para usos que no son "día de negocio" (nombre de archivo de backup).

Los defaults de `getWeekStartStr`, `getPreviousWeekRangeStr`, `getMonthStartStr`, `getDateNDaysAgoStr` pasan de `todayStr()` a `businessDayStr()`, para que "esta semana/mes" también respete el corte.

Se reemplaza el `today`/fecha-de-referencia por `businessDayStr()` en:
- `InventoryApp.jsx`: `todaysMovements` (header VENDIDO HOY + badge de stock bajo/pendiente), y el `date` que se estampa en movimientos de **pedidos nuevos** (`confirmOrder`, pasado explícito en `makeMovement(..., { date: businessDayStr() })` — NO se toca el default de `makeMovement`, que sigue usando `todayStr()`, porque también lo usan los ajustes manuales de stock, que no deben correrse de día).
- `Today.jsx`, `Orders.jsx` (agrupación "Pedidos de hoy"/anteriores), `WeeklySummary.jsx` (rango semana/mes actual).
- `editOrder` seguía preservando `originalDate` del pedido editado — sin cambios, es intencional.

## Verificación manual

1. Pedido confirmado antes de las 4pm → `date` = hoy (calendario), aparece en "Pedidos de hoy" y en pestaña Hoy, igual que siempre.
2. Pedido confirmado después de las 4pm → `date` = mañana, aparece igual en "Pedidos de hoy" (porque el "hoy" de la UI también avanzó) y sus stats reflejan en el día siguiente. Verificado simulando reloj a las 17:30: pedido nuevo quedó con `date` = día+1, pedido viejo del mismo día (creado antes del corte) pasó a "Pedidos anteriores".
3. Cambiar sort a "Más antiguos primero" + activar "Solo no enviados" en Pedidos, recargar página → ambos quedan igual que antes de recargar.
