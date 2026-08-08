# Inventario Procovar

Componente React de control de stock diario para Procovar (Parranda / Malta Guajira). Registra ventas, ajustes manuales de existencias, deshacer último movimiento e historial, con persistencia vía `window.storage`.

## Uso

`InventoryApp` (export default de [`inventario-procovar.jsx`](./inventario-procovar.jsx)) espera un entorno con:

- React 18+
- `lucide-react` para los íconos
- `window.storage.get(key, isPublic)` / `window.storage.set(key, value, isPublic)` para persistencia

## Diseño

Mobile-first: filas de acción (venta) y de historial usan `flex-wrap` para evitar overflow horizontal en pantallas angostas, inputs numéricos con `inputMode="numeric"` para teclado táctil correcto, y `font-size: 16px` en el input de venta para evitar el zoom automático de iOS Safari en foco.
