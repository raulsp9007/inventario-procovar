// Vendedores actuales: la página de la facturadora los muestra siempre, en orden
// alfabético, aunque todavía no tengan pedidos (o la página aún no esté enlazada).
// Los que trae el buzón se unen a esta lista por nombre; si el buzón trae otro
// vendedor, también aparece. Para sumar o quitar a alguien: editar esta lista y
// generar sus códigos con worker/scripts/provision.mjs.
export const KNOWN_SELLERS = ["Lorenzo", "Leodanis", "Melisa", "Niurka", "Raul", "Eddy"];
