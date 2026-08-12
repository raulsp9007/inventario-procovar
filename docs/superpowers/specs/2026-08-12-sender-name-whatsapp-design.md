# Diseño: "Enviar mi nombre" en Configuración

**Fecha:** 2026-08-12
**Estado:** Aprobado, implementación directa (sin plan formal)

## Qué

Pestaña Configuración gana un campo de texto ("Mi nombre") + checkbox ("Enviar mi nombre"). Cuando el checkbox está activo, cada mensaje de WhatsApp generado por un pedido antepone el nombre configurado como primera línea:

```
MINOMBRE
NOMBRE CLIENTE
Product1 - x
Product2 - x
```

Si `isDelivery`, la línea "🛺 Domicilio 🛺" va después del nombre del remitente y antes del nombre del cliente (no cambia su posición relativa al resto).

## Modelo de datos

- Nuevos campos persistidos en la raíz: `senderName: string` (default `""`), `sendSenderName: boolean` (default `false`).
- Blindaje: `parsed.senderName || ""`, `parsed.sendSenderName ?? false` — mismo patrón que `whatsappPhone`.

## Componentes

- `Settings.jsx`: nuevo bloque con input de texto (nombre) + checkbox, debajo del bloque de teléfono. Guarda con el mismo botón "Guardar" existente o uno propio — se agrega guardado independiente del nombre/checkbox (no dependen del teléfono).
- `orderHelpers.js`: `formatOrderForWhatsApp(order, products, { senderName, sendSenderName } = {})` — si `sendSenderName && senderName.trim()`, antepone la línea del nombre.
- `Orders.jsx`: recibe `senderName`/`sendSenderName` como props nuevas desde `InventoryApp.jsx`, las pasa a `formatOrderForWhatsApp` en los dos puntos donde arma el mensaje (envío individual y en bloque).

## Verificación manual

1. Checkbox apagado (default) → mensaje sale igual que hoy, sin línea de nombre.
2. Escribir nombre + activar checkbox → mensaje nuevo antepone el nombre.
3. Pedido con domicilio + nombre activo → orden: nombre remitente, 🛺 Domicilio 🛺, cliente, productos.
4. Nombre vacío pero checkbox activo → no se agrega línea vacía (fallback seguro).
5. Envío en bloque respeta el mismo formato que el individual.
