# Diseño: total por pedido, pestaña Configuración (teléfono WhatsApp), auto-marcar enviado, checkbox Confirmado

**Fecha:** 2026-08-11
**Estado:** Aprobado, implementación directa (sin plan formal)

## 1. Total por pedido

`orderHelpers.js` ya guarda `unitPrice` en cada línea (agregado para el historial de clientes). `Orders.jsx` (`renderOrderRow`) calcula `order.lines.reduce((s,l) => s + l.qty*l.unitPrice, 0)` y lo muestra junto a la fecha/productos, solo si `showPrices` (prop nueva, mismo criterio que el resto de la app). `Orders` no recibía `showPrices` hasta ahora — se agrega como prop desde `InventoryApp.jsx`.

## 2. Pestaña "Configuración" — teléfono de WhatsApp

Nuevo campo persistido `whatsappPhone` (string, dígitos con código de país, ej. `5359xxxxxxx`, sin `+` ni espacios — se explica en el placeholder). `src/Settings.jsx` (nuevo componente): input de texto + validación mínima (solo dígitos, se limpia con `.replace(/\D/g, "")` al guardar), persiste con el mismo patrón que `hlGoal`/`exchangeRate` (estado local + `onChange` → callback al padre → `persist`). Pestaña nueva en la barra de navegación, al final (Hoy / Resumen semanal / Pedidos / Clientes / Productos / **Configuración**).

`openOrderWhatsApp(order, products, phone)`: si `phone` tiene contenido, `https://wa.me/${phone}?text=...`; si no, como ya funciona hoy, `https://wa.me/?text=...` (abre selector de contacto). `Orders.jsx` recibe `whatsappPhone` como prop nueva.

## 3. Auto-marcar "Enviado" al enviar (individual y en bloque)

El botón de enviar individual (`renderOrderRow`) pasa de solo `openOrderWhatsApp(...)` a también llamar `onMarkSent(order.orderId, true)` — mismo comportamiento que ya tiene el envío en bloque. Sigue siendo editable a mano después (destildar si hace falta reenviar).

## 4. Checkbox "Confirmado" (doble check)

Nuevo campo en movimientos de pedido: `confirmed: boolean` (igual patrón que `sent`). `groupAllOrders` lo expone en el objeto de pedido (`confirmed: !!m.confirmed`). Nueva función `markOrderConfirmed(orderId, confirmed)` en `InventoryApp.jsx` (idéntica a `markOrderSent`, pero pisa `confirmed`). Nuevo checkbox en la fila del pedido (modo normal, junto al de "Enviado"), ícono de doble check (`CheckCheck` de lucide-react) + texto "Confirmado". Completamente independiente de "Enviado" — ambos manuales, ambos editables en cualquier momento, sin relación entre sí salvo que "Enviado" ahora también se autotilda al enviar (punto 3).

## Modelo de datos (resumen)

- Estado raíz nuevo: `whatsappPhone: string`.
- Movimiento de pedido gana `confirmed: boolean` (junto a `sent` que ya existe).
- Blindaje: `whatsappPhone` carga con `parsed.whatsappPhone || ""`, `confirmed` con `!!m.confirmed` (default `false` para pedidos viejos sin el campo) — mismo patrón ya usado en todo el proyecto.

## Verificación (manual, sin suite de tests)

1. Pedido con 2 líneas y precios cargados → total mostrado es la suma correcta, oculto si `showPrices` está apagado.
2. Configurar teléfono en Configuración, volver a Pedidos, tocar "Enviar" en un pedido → la URL de WhatsApp abierta incluye el número (verificar con `window.open` interceptado, como en pruebas anteriores).
3. Sin teléfono configurado → sigue abriendo el selector de contacto (`wa.me/?text=...`), sin romperse.
4. Tocar "Enviar" individual → el pedido queda marcado "Enviado" solo (antes no pasaba, era manual).
5. Envío en bloque sigue marcando Enviado igual que antes (sin cambios).
6. Tildar "Confirmado" en un pedido → persiste, no afecta el checkbox "Enviado" ni viceversa.
7. Pedido viejo sin campo `confirmed` en sus movimientos → aparece destildado, sin crash.
8. Mobile 375px: fila de pedido con los dos checkboxes + total, sin overflow horizontal.
