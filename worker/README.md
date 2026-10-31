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

Imprime un código de enlace por usuario de demostración. Los datos viven en memoria
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
   `node scripts/provision.mjs --vendedores "Nombre 1,Nombre 2,..." --facturadora "Facturadora"`
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
  Para ver lo que confirmó la facturadora, pulsa **Comprobar** (en Pedidos o en
  Configuración); la app no lo hace sola.
- **Facturadora:** abre su **enlace personal** (el paso 8 lo imprime junto a su código):
  `https://raulsp9007.github.io/inventario-procovar/facturadora.html#CÓDIGO`. La primera vez
  la deja enlazada en ese navegador y quita el código de la barra; después basta abrir
  `…/facturadora.html` (conviene guardarlo en favoritos). No necesita APK. Es un sitio
  aparte de la app de ventas.

## Cambiar o quitar a alguien

Vuelve a correr el paso 5 con otra lista (borra antes `worker/.usuarios.secret.json`),
repite el 6 y entrega los códigos nuevos. Los códigos anteriores dejan de servir.

## Qué guarda el buzón

Cliente (con su código del portal y su negocio, si los tiene), fecha, productos con
cantidad y precio, total y estado. **No** guarda teléfonos ni notas. Los pedidos de más de 60 días se borran solos.
