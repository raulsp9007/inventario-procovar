# Buzón de pedidos (Cloudflare Worker + D1)

Conecta a los vendedores con la facturadora. Diseño en
`docs/superpowers/specs/2026-10-30-facturacion-nube-design.md`.

- El vendedor sube sus pedidos enviados a facturación.
- La facturadora ve los pedidos por vendedor y da 👍.
- Su 👍 marca solo el paso **CONF.** en la app del vendedor.

Cuesta cero a este volumen (6 vendedores y 1 facturadora).

## Probarlo en local, sin Cloudflare

```
node worker/scripts/dev-server.mjs      # buzón de demostración en http://localhost:8787
```

Imprime un código de enlace por usuario de demostración (incluido un administrador). Los datos viven en memoria
y se pierden al apagarlo.

## Desplegarlo (una sola vez)

Necesitas una cuenta gratuita de Cloudflare. Todo desde la carpeta `worker/`:

1. **Instalar:** `npm install`
2. **Entrar a tu cuenta:** `npx wrangler login`
3. **Crear la base:** `npx wrangler d1 create procovar-buzon`
   Copia el `database_id` que muestra dentro de `wrangler.toml`.
4. **Crear la tabla:** `npx wrangler d1 execute procovar-buzon --remote --file=schema.sql`
   (la primera vez; el esquema ya incluye `customer_code` y `business_name`).
5. **Generar los códigos** (uno por persona):
   `node scripts/provision.mjs --vendedores "Lorenzo,Leodanis,Melisa,Niurka,Raul,Eddy" --facturadora "Facturadora"`
   (usa estos nombres tal cual: la página de la facturadora los une por nombre con su lista
   de vendedores, `src/facturadoraSellers.js`; si cambia alguien, edita esa lista también).
   Guarda los códigos en `worker/.usuarios.secret.json` (no se sube a git) e imprime el
   secreto `USERS`.
6. **Guardar el secreto:** `npx wrangler secret put USERS` y pega el JSON del paso 5.
7. **Publicar:** `npx wrangler deploy`. Muestra la dirección, algo como
   `https://procovar-buzon.TU-CUENTA.workers.dev`.
8. **Sacar los códigos de enlace:**
   `node scripts/provision.mjs --url https://procovar-buzon.TU-CUENTA.workers.dev`
   Entrega a cada persona **su** código (por WhatsApp, en privado).

Comprobación rápida: `https://procovar-buzon.TU-CUENTA.workers.dev/me` debe responder
`401` (sin código) y no un error 500. Un 500 con "no está bien configurado" significa
que falta el secreto `USERS` o tiene un error (el mensaje dice cuál).

## Cada persona usa su código

- **Vendedor:** Configuración → "Nube de facturación" → pegar el código → Enlazar.
  La app comprueba sola lo que confirmó la facturadora **cada hora** (con la app abierta, y
  al volver a ella si ya pasó una hora). Para verlo ya, pulsa **Comprobar** (en Pedidos o en
  Configuración).
- **Facturadora con contraseña:** abre `…/facturadora.html`, escribe su contraseña y pulsa
  **Entrar** (el navegador puede recordarla). La contraseña es el código de su usuario en
  `USERS` (mínimo 20 caracteres; puede ser una frase fácil de recordar). Para cambiarla:
  edita el `token` de la facturadora en `worker/.usuarios.secret.json`, vuelve a guardar el
  secreto `USERS` (paso 6) y publica. El código viejo deja de servir.
- **Facturadora con enlace:** abre su **enlace personal** (el paso 8 lo imprime junto a su código):
  `https://raulsp9007.github.io/inventario-procovar/facturadora.html#CÓDIGO`. La primera vez
  la deja enlazada en ese navegador y quita el código de la barra; después basta abrir
  `…/facturadora.html` (conviene guardarlo en favoritos). No necesita APK. Es un sitio
  aparte de la app de ventas.

## Sitio de administración (nombres y enlaces de los vendedores)

El **administrador** maneja la lista de vendedores sin tocar la consola, desde
`https://raulsp9007.github.io/inventario-procovar/admin.html`. Allí puede:

- **Agregar** un vendedor (el buzón le crea su código).
- **Cambiar el nombre** (el código y los pedidos se conservan).
- **Copiar el código** o el **mensaje listo para WhatsApp** de cada vendedor.
- **Regenerar el enlace** (el código anterior deja de servir) y **desactivar / reactivar**.
- Copiar el **enlace personal de la facturadora**.

Lo que se cambia ahí vive en la base (tabla `vendors`) y se junta con los vendedores del
secreto `USERS`; lo de la base gana. La página de la facturadora toma de ahí su lista.

Activarlo (una sola vez; tras actualizar el código del buzón):

1. `node scripts/provision.mjs --admin "Tu nombre"`: agrega al administrador a
   `worker/.usuarios.secret.json` **sin cambiar** los códigos que ya se entregaron, e
   imprime su enlace personal (`…/admin.html#CÓDIGO`) si pasas `--url`.
2. Vuelve a guardar el secreto `USERS` (paso 6; ahora lleva al administrador).
3. Aplica la tabla nueva: `npx wrangler d1 execute procovar-buzon --remote --file=schema.sql`
   (se puede repetir sin problema).
4. Publica el buzón: `npx wrangler deploy`.

El enlace del administrador es **solo tuyo**: con él se pueden cambiar todos los códigos.

## Usuario y contraseña de facturación y supervisión

Además de los vendedores, el administrador define desde `admin.html` dos accesos con
**usuario y contraseña** (sección "Acceso con usuario y contraseña"):

- **Facturación:** hace todo lo de la facturadora (ver pedidos, confirmar y deshacer).
- **Supervisión:** **solo lectura**. Ve los pedidos por vendedor con sus estados; el buzón le
  responde 403 si intenta confirmar, deshacer o cambiar algo.

Hay uno de cada. Entran en `…/facturadora.html` escribiendo su usuario y contraseña; la página
muestra solo el acceso hasta entrar. La contraseña (8 a 100 caracteres) no se guarda: el buzón
solo guarda su huella, y no se puede volver a leer (se puede cambiar). Tras 5 intentos fallidos
la cuenta se bloquea 5 minutos. Entrar da una sesión de 24 horas (pasado ese tiempo hay que volver a entrar); cambiar la contraseña o
desactivar el acceso cierra las sesiones abiertas. El usuario no puede repetirse entre las dos
cuentas.

Mientras no se cree la cuenta de facturación, sigue sirviendo el código de la facturadora del
secreto `USERS` (o su contraseña/enlace de antes: se escribe sin usuario). Al crearla, la cuenta
nueva **reemplaza** a ese código.

Activarlo (una sola vez, en este orden):

1. Aplica la tabla nueva: `npx wrangler d1 execute procovar-buzon --remote --file=schema.sql`
   (crea `accounts` y `sessions`; se puede repetir sin problema).
2. Publica el buzón: `npx wrangler deploy`.
3. Publica la página (push). Después entra a `admin.html` y crea los accesos.

## Horario de facturación

Desde `admin.html` (tarjeta "Horario de facturación") el administrador puede poner **un solo
horario**: hora de apertura y de cierre, de lunes a sábado, en la **hora del sitio** (ver abajo; por defecto la de Cuba); el domingo está
cerrado. Fuera de horario se **pausa el sitio**:

- los vendedores no pueden enviar a facturación (el buzón responde 423 y sus pedidos esperan en
  cola; se envían solos cuando abre: al pulsar Comprobar, en la comprobación de cada hora o al
  cambiar un pedido);
- la facturadora no puede confirmar ni deshacer (ve todo, pero los botones quedan apagados y se
  le avisa cuándo abre).

Ver pedidos, el administrador y la supervisión siguen funcionando. Sin el horario activado el
sitio está abierto a cualquier hora (así queda al principio).

## Hora del sitio

El horario de facturación, el cierre del día y el día del contador de ventas se cuentan en una
**zona horaria** que elige el administrador (tarjeta "Hora del sitio", `GET/PUT /admin/zona`): por
defecto la de Cuba (La Habana); si el sitio no coincide con la hora de tu ciudad, elige otra de la
lista. La tarjeta muestra la hora que es ahora en la zona elegida. La app del vendedor cuenta el
cierre del día con esa misma zona. No hace falta tocar la base de datos (se guarda como un ajuste).

## Cierre de facturación del día

Aparte del horario, el administrador puede poner **una hora de cierre del día** (tarjeta "Cierre de
facturación del día", `GET/PUT /admin/cierre`, en la hora del sitio). Pasada esa hora el vendedor ya no
puede enviar a facturación un pedido **de hoy** (el buzón responde 409 con el motivo, y la tarjeta
del pedido lo muestra en rojo); los pedidos **de otro día** sí se pueden enviar, y también borrar,
confirmar a mano o pasar para mañana. La facturadora sigue confirmando lo que ya llegó. La app del
vendedor pregunta el cierre justo al tocar FACT. y avisa antes de marcar el pedido. Sin activarlo,
no hay cierre (así queda al principio). No hace falta tocar la base de datos: se guarda como un
ajuste más. Para que funcione hay que volver a publicar el buzón (`npx wrangler deploy`).

## Ventas por día

El buzón cuenta lo enviado a facturación cada día (confirmado o no; sin cancelados), producto por
producto y por vendedor: `GET /summary?fecha=AAAA-MM-DD` (sin fecha, hoy en Cuba). Lo ven el
administrador (en `admin.html`, "Ventas por día") y la supervisión (botón "Ventas del día"), con
selector de día. Cada vendedor ve además su propio contador de hoy en Pedidos → Hoy ("Enviado a
facturación hoy"), calculado en su teléfono.

Activarlo (una sola vez, en este orden): aplica las tablas (`settings` es nueva)
`npx wrangler d1 execute procovar-buzon --remote --file=schema.sql`, publica el buzón
`npx wrangler deploy` y después la página (push).

## Cambiar o quitar a alguien

Desde el sitio de administración (ver arriba). Solo si hace falta rehacerlo todo desde
cero: vuelve a correr el paso 5 con otra lista (borra antes `worker/.usuarios.secret.json`),
repite el 6 y entrega los códigos nuevos; los anteriores dejan de servir.

## Qué guarda el buzón

Cliente (con su código del portal y su negocio, si los tiene), fecha, productos con
cantidad y precio, total y estado. **No** guarda teléfonos ni notas. Los pedidos de más de 60 días se borran solos.
