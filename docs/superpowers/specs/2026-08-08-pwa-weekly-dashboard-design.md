# Diseño: PWA offline + dashboard semanal + timestamp de ajustes

**Fecha:** 2026-08-08
**Estado:** Aprobado, pendiente de plan de implementación

## Contexto

`inventario-procovar.jsx` es hoy un único componente React pensado para correr dentro de un host tipo Claude Artifact (usa `window.storage.get/set`, una API que no existe en un navegador normal). El repo (`raulsp9007/inventario-procovar`) solo contiene ese archivo suelto y un README — no hay `index.html`, build ni forma de desplegarlo.

El dueño del negocio quiere:

1. Un resumen de ventas semanal por producto.
2. Poder instalar el sitio como app offline en su dispositivo (PWA).
3. Que cada ajuste manual de stock quede con fecha/hora registrada, visible por producto.
4. Botón "Registrar venta" más compacto para ahorrar espacio en mobile.

Esto implica convertir el componente suelto en un sitio real desplegable, no solo agregar features al JSX.

## Alcance

Incluye: migración a proyecto Vite, reemplazo de `window.storage` por `localStorage`, dashboard semanal (nueva vista/tab), campo de última modificación de stock por producto, cambio de botón de venta, configuración PWA instalable, deploy automático a GitHub Pages.

Fuera de alcance: sincronización multi-dispositivo/nube, autenticación, edición de catálogo de productos (`PRODUCTS` sigue siendo una constante fija en código), tests automatizados (no existen hoy, no se introducen — se verifica manualmente).

## Arquitectura

**Opción elegida: Vite + `vite-plugin-pwa`.**

Alternativas descartadas:
- *Sitio estático a mano* (HTML + React/Babel por CDN, manifest y service worker escritos manualmente): sin paso de build, pero Babel-en-navegador es lento en producción y un service worker a mano es frágil (fácil dejar el cache sirviendo una versión vieja sin darse cuenta).
- *Framework grande (Next.js, etc.)*: sin necesidad de SSR/routing complejo para una app de 5 productos; complejidad injustificada.

Vite da build optimizado, y `vite-plugin-pwa` genera manifest + service worker (estrategia `generateSW`, `registerType: "autoUpdate"`) sin mantenimiento manual del cache.

### Estructura del repo (nueva)

```
inventario-procovar-repo/
├── index.html
├── package.json
├── vite.config.js
├── public/
│   ├── icon-192.png
│   └── icon-512.png
├── src/
│   ├── main.jsx
│   ├── InventoryApp.jsx        (componente principal, hoy inventario-procovar.jsx)
│   ├── WeeklySummary.jsx        (nueva vista de resumen semanal)
│   ├── storage.js               (wrapper localStorage, reemplaza window.storage)
│   └── dateUtils.js             (helpers de semana: inicio de semana, semana anterior)
├── .github/workflows/deploy.yml (build + deploy a GitHub Pages en push a main)
└── docs/superpowers/specs/...
```

El archivo `inventario-procovar.jsx` en la raíz se elimina del repo una vez migrado su contenido a `src/`.

### Despliegue

GitHub Actions (`.github/workflows/deploy.yml`) corre en cada push a `main`: `npm ci && npm run build`, publica `dist/` a GitHub Pages usando `actions/deploy-pages`. Se requiere activar Pages en el repo con source "GitHub Actions" (paso manual único de configuración en GitHub, se documenta en el README).

## Modelo de datos

Se mantiene el shape actual guardado bajo la key `procovar-inventario-v1`, y se agrega un campo nuevo:

```js
{
  stock: { [code]: number },
  movements: [{ id, code, type: "venta" | "ajuste", qty, date, timestamp }],
  lastAdjustedAt: { [code]: isoTimestampString }   // NUEVO
}
```

`lastAdjustedAt[code]` se escribe únicamente en `saveEdit()` (modo "Ajustar existencias"), solo para los productos cuyo valor cambió (mismo criterio que ya se usa para generar el movimiento de tipo `ajuste`). Las ventas no lo tocan — se mantiene separado del historial de movimientos general, que ya muestra "último movimiento" para cualquier tipo.

Migración: si `lastAdjustedAt` no existe en datos guardados previos (usuarios que ya venían usando la versión anterior), se trata como `{}` — los productos simplemente no muestran fecha de ajuste hasta el primer ajuste hecho con la nueva versión. No hace falta migración activa de datos viejos.

## Componentes

### `storage.js`

Reemplaza `window.storage.get/set` por funciones sobre `localStorage`, mismas firmas async (para no tocar las llamadas en `InventoryApp`):

```js
export async function getData(key) { ... }  // localStorage.getItem + JSON.parse
export async function setData(key, value) { ... } // localStorage.setItem
```

Mantener la interfaz async es deliberado: aísla el resto del componente de dónde vive el dato, en caso de que el negocio pida sync remoto más adelante.

### `dateUtils.js`

```js
getWeekStart(date)      // lunes de la semana de `date`, hora 00:00 local
getPreviousWeekRange(date) // { start, end } del lunes a domingo anterior
```

Semana definida lunes→domingo (estándar ISO, coincide con convención regional). "Semana actual" = lunes de esta semana hasta hoy inclusive (no hasta el domingo, porque aún no pasó).

### `WeeklySummary.jsx`

Nueva vista, activada por un toggle en la parte superior de la página ("Stock" / "Resumen semanal"). Recibe `movements` y `PRODUCTS` como props, calcula localmente (sin nuevo estado guardado):

- Por producto: suma de `qty` en movimientos `type === "venta"` con `date` dentro de la semana actual (lunes→hoy).
- Igual cálculo para la semana anterior completa (lunes→domingo pasados).
- Diferencia porcentual: `((actual - anterior) / anterior) * 100`, mostrando "—" si la semana anterior fue 0 (evita división por cero / infinito engañoso).

Formato: tabla/lista simple, una fila por producto — nombre corto, unidades esta semana, variación vs semana pasada (↑/↓ + %, o "—").

### `InventoryApp.jsx` (cambios sobre el actual)

- Importa y usa `storage.js` en vez de `window.storage`.
- Agrega toggle de vista (Stock / Resumen semanal) en el header o justo debajo.
- En `saveEdit()`, además de generar movimientos de ajuste, actualiza `lastAdjustedAt` para los códigos con diferencia y lo persiste junto al resto.
- Tarjeta de producto: si `lastAdjustedAt[code]` existe, muestra "ajustado {fecha} {hora}" (usa `toLocaleString` con hora, a diferencia de "último movimiento" que solo muestra fecha).
- Botón de venta: texto "Registrar venta" reemplazado por el ícono `Plus` (ya importado, sin uso actual) con `aria-label="Registrar venta"` y `title="Registrar venta"` para mantener accesibilidad y claridad sin ocupar texto.

## Manejo de errores

- `localStorage` lleno o bloqueado (modo incógnito con storage deshabilitado, cuota excedida): `setData` propaga el error, `persist()` en `InventoryApp` ya captura y muestra el error existente ("No se pudo guardar. Intenta de nuevo.") — sin cambios de comportamiento ahí, solo cambia la implementación debajo.
- Semana anterior sin datos (negocio nuevo, o producto nunca vendido): se muestra "—" en vez de un porcentaje sin sentido.
- Service worker: `vite-plugin-pwa` con `registerType: "autoUpdate"` refresca la versión cacheada automáticamente en background sin pedir confirmación al usuario — prioriza que el local siempre tenga la versión más nueva disponible sobre el riesgo (bajo, para esta app) de una recarga inesperada.

## Verificación (no hay suite de tests)

Manual, tras implementar:
1. `npm run build && npm run preview` — confirmar que carga y funciona igual que antes (ventas, ajustes, deshacer, validación de oversell).
2. DevTools → Application → verificar `localStorage` tiene la key correcta y el manifest/service worker están registrados.
3. Simular datos de venta cruzando el límite de semana (fechas manipuladas) para confirmar que el cálculo semana-actual vs semana-anterior es correcto.
4. Ajustar stock de un producto, confirmar que aparece fecha/hora y que una venta *no* la modifica.
5. Poner el navegador en modo offline (DevTools → Network → Offline) y recargar — confirmar que la app sigue funcionando.
6. Revisar prompt de instalación disponible en Chrome desktop/Android.
7. Confirmar layout mobile del botón "+" y del toggle Stock/Resumen a 375px de ancho, sin overflow.
