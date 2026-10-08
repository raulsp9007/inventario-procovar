// Versión de la app que se muestra en Configuración: el commit con el que se
// construyó (lo define vite.config.js al compilar). "dev" si no se puede saber.
export const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
