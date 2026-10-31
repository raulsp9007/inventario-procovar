# Facturación en la nube (fase 1)

Cuando la facturadora da 👍 a un pedido completado, la app del vendedor marca
sola el paso **CONF.** de ese pedido. Antes lo marcaba el vendedor a mano.

## Piezas

1. **Buzón** (`worker/`): API pequeña en un Cloudflare Worker con base D1 (gratis
   a este volumen: 6 vendedores, 1 facturadora). Cloudflare ya sirve el portal de
   pedidos y abre desde donde se trabaja.
2. **App del vendedor** (la actual): sube cada pedido enviado a facturación y, solo
   cuando el vendedor pulsa **Comprobar** (barra en Pedidos y en Configuración),
   consulta qué confirmó la facturadora y marca CONF. No consulta por su cuenta.
3. **Sitio web de la facturadora** (`facturadora.html`, publicado con la misma
   GitHub Pages; sin APK ni service worker). Entra con su enlace personal
   (`…/facturadora.html#código`: se guarda y se quita de la barra). Vendedores →
   pedidos (con negocio y código del cliente) → 👍. Se refresca solo cada 30 s y
   pone el número de pendientes en el título de la pestaña. (El modo
   `?rol=facturadora` de la app sigue existiendo, pero ya no es el camino.)

## Reglas

- El vendedor manda el **contenido** del pedido; la facturadora manda el **estado**.
- Un pedido llega al buzón al marcar **FACT.** (enviado a facturación), si no es
  domicilio (los domicilios van al supervisor; fuera de la fase 1) y es **de hoy**:
  los de otros días (viejos o "Para mañana") no se suben; el de mañana se sube
  cuando llega su día. Un pedido ya subido cuyo día pasó se deja quieto.
- El sitio de la facturadora solo muestra los pedidos de **hoy** (pide `desde=hoy`
  y descarta lo guardado de otro día): a las 12 am la lista se limpia sola, aunque
  quedaran pedidos sin confirmar. La fecha es la del dispositivo (hora de Cuba).
  Los pedidos de días anteriores siguen en el buzón (60 días), así que el vendedor
  aún puede comprobar su estado.
- Estados: `pendiente` → `confirmado` (por la facturadora, o por el vendedor a
  mano) · `cancelado` (el vendedor lo eliminó o lo des-envió).
- Si el vendedor **cambia el contenido** de un pedido ya enviado: vuelve a
  `pendiente`, sube la revisión y se marca `modificado`.
- Mismo contenido enviado dos veces: no cambia nada (idempotente).
- El 👍 se puede **deshacer** (la facturadora).
- Si el vendedor confirma a mano antes del 👍, el pedido sale de la lista de ella.
- Se borran del buzón los pedidos de más de 60 días.

## Seguridad

- Siete códigos secretos (uno por vendedor y uno de la facturadora), guardados
  como secreto del Worker (`USERS`). Cada vendedor solo ve y toca **sus** pedidos.
- La app se enlaza con un **código de enlace** que lleva la dirección y el token;
  no se piden usuarios ni contraseñas.
- No se sube el teléfono del cliente ni notas: solo nombre, código del cliente,
  negocio, productos, cantidades, precios, total y fecha. El código y el negocio no
  cuentan como "contenido": ponerlos o cambiarlos no reabre un pedido confirmado.
- CORS limitado a `https://raulsp9007.github.io` (y `localhost` en desarrollo).

## API (JSON, `Authorization: Bearer <token>`)

| Quién | Método y ruta | Qué hace |
|---|---|---|
| ambos | `GET /me` | rol y nombre del dueño del token |
| vendedor | `PUT /orders/:id` | sube o actualiza un pedido propio |
| vendedor | `DELETE /orders/:id` | lo marca `cancelado` |
| vendedor | `POST /orders/:id/confirm` | confirmación manual del vendedor |
| vendedor | `GET /orders/status?since=` | estado de sus pedidos cambiados desde `since` |
| facturadora | `GET /orders?desde=` | pedidos agrupados por vendedor |
| facturadora | `POST /orders/confirm` `{ids}` | 👍 a uno o varios |
| facturadora | `POST /orders/unconfirm` `{ids}` | deshacer el 👍 |

## Sin internet

Cada app guarda una **cola** de envíos y confirmaciones y la vacía sola al volver
la conexión. La cola vive aparte del estado de la app (no entra en los respaldos).
