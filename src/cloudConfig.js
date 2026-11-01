// Dirección del buzón de pedidos (Cloudflare Worker). No es un secreto: sin una
// contraseña válida no se puede leer nada. Permite que la facturadora entre solo con
// su contraseña, sin pegar el código de enlace largo.
export const CLOUD_URL = "https://procovar-buzon.procovar-buzon.workers.dev";
