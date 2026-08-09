# Inventario Procovar

App de control de stock diario para Procovar (Parranda / Malta Guajira): registra ventas, ajustes manuales de existencias (con fecha/hora del último ajuste por producto), deshacer último movimiento, historial, y un resumen de ventas semanal por producto. Instalable como app offline (PWA) — los datos se guardan solo en el dispositivo donde se usa (`localStorage`), sin sincronización entre dispositivos.

## Sitio en vivo

https://raulsp9007.github.io/inventario-procovar/

Para instalarla como app: abrir esa URL en el navegador del teléfono/computador y usar la opción "Agregar a inicio" (Android/Chrome) o el ícono de instalar en la barra de direcciones (desktop). En iPhone (Safari): compartir → "Agregar a pantalla de inicio".

## Desarrollo local

Requiere Node 20.19+ (Vite 8 lo exige).

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`.

## Build de producción

```bash
npm run build
npm run preview
```

## Estructura

- `src/InventoryApp.jsx` — vista principal (stock, ventas, ajustes, historial).
- `src/WeeklySummary.jsx` — resumen de ventas semanal por producto.
- `src/storage.js` — wrapper sobre `localStorage`.
- `src/dateUtils.js` — helpers de fecha y cálculo de semana (lunes a domingo).
- `scripts/generate-icons.mjs` — genera los íconos de `public/` usados por el manifest de la PWA.

## Deploy

Automático: cada push a `main` dispara `.github/workflows/deploy.yml`, que hace `npm run build` y publica `dist/` en GitHub Pages.
