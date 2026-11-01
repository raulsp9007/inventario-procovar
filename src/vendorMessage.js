// Mensaje que se le manda a cada vendedor con su código de enlace (para WhatsApp:
// los asteriscos ponen negrita). Lo usa el sitio de administración.
export function buildVendorMessage(name, code) {
  return `Hola ${name} 👋 Desde hoy los pedidos se facturan por la nube: ya no hay que mandar WhatsApp a la facturadora.

*UNA SOLA VEZ (5 minutos)*
1. Actualiza la app: ciérrala del todo y ábrela de nuevo. (Si en Configuración no ves "Nube de facturación", toca *Actualizar*.)
2. Ve a *Configuración → Nube de facturación*.
3. Pega este código y toca *Enlazar*:

${code}

4. Debe decir *"Enlazado como ${name}"*.
5. Marca la casilla *Facturar a la nube*.

*CADA PEDIDO*
1. Crea el pedido en *Pedidos → Hoy*, como siempre.
2. Cuando esté listo para facturar, toca *FACT.* (ya no abre WhatsApp). Le sale *"En nube"*: la facturadora ya lo ve.
3. Cuando ella lo confirme, toca *Comprobar* (arriba, en Pedidos). El pedido pasa a *CONF.*

*OJO*
• Solo se envían los pedidos de *hoy*. A las 12 am la lista de la facturadora se limpia.
• Los *domicilios* siguen yendo al supervisor por WhatsApp.
• Si dice "En cola", no hay internet: se envía solo al volver.
• Si editas un pedido ya enviado, ella lo ve como MODIFICADO.
• Ese código es *solo tuyo*: no lo compartas ni lo reenvíes.

Cualquier duda me escribes.`;
}
