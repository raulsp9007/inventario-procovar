import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

// Commit con el que se construye la app (7 caracteres): en GitHub Actions viene
// en GITHUB_SHA; en local se pide a git. Se muestra en Configuración para saber
// qué versión se tiene. "dev" si no hay forma de saberlo.
function appVersion() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync("git rev-parse --short=7 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "dev";
  } catch {
    return "dev";
  }
}

export default defineConfig(({ mode, isPreview }) => {
  // Both `vite build` and `vite preview` report mode "production"; only `vite dev`
  // is "development". isPreview is included too so an explicit --mode override on
  // build (e.g. a debug build) can't silently reset the GitHub Pages base to "/".
  const base = mode === "production" || isPreview ? "/inventario-procovar/" : "/";

  return {
    base,
    define: {
      __APP_VERSION__: JSON.stringify(appVersion()),
    },
    server: {
      port: Number(process.env.PORT) || 5173,
    },
    // Tres páginas: la app de los vendedores (index.html), el sitio de la facturadora
    // (facturadora.html) y el de administración (admin.html), estos dos sin service worker.
    build: {
      rollupOptions: {
        input: {
          main: fileURLToPath(new URL("./index.html", import.meta.url)),
          facturadora: fileURLToPath(new URL("./facturadora.html", import.meta.url)),
          admin: fileURLToPath(new URL("./admin.html", import.meta.url)),
        },
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/setupTests.js"],
    },
    plugins: [
      react(),
      // Los sitios de la facturadora y de administración no son la app instalable de
      // los vendedores: sin su manifest, el navegador no les ofrece instalarse como
      // "Inventario Procovar".
      {
        name: "paginas-sueltas-sin-manifest",
        apply: "build",
        enforce: "post",
        closeBundle() {
          ["facturadora.html", "admin.html"].forEach((page) => {
            const file = fileURLToPath(new URL(`./dist/${page}`, import.meta.url));
            if (!existsSync(file)) return;
            writeFileSync(file, readFileSync(file, "utf8").replace(/<link rel="manifest"[^>]*>/g, ""));
          });
        },
      },
      VitePWA({
        // "prompt": la versión nueva se descarga pero NO se activa sola ni
        // recarga la app (autoUpdate lo hacía y podía tirar un formulario a
        // medias). En su lugar avisa (barra arriba + Configuración) y se aplica
        // al tocar "Actualizar".
        registerType: "prompt",
        // El registro lo hace a mano src/pwaStatus.js (vía virtual:pwa-register),
        // no el script que el plugin inyectaría solo -- así se puede exponer el
        // aviso de "hay una versión nueva".
        injectRegister: false,
        includeAssets: ["icon-192.png", "icon-512.png"],
        workbox: {
          navigateFallback: `${base}index.html`,
          // El sitio de la facturadora es otra página: ni se guarda para uso sin
          // conexión ni la reemplaza la app de los vendedores.
          navigateFallbackDenylist: [/(facturadora|admin)\.html$/],
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
          globIgnores: ["**/facturadora.html", "**/admin.html"],
        },
        manifest: {
          name: "Inventario Procovar",
          short_name: "Procovar",
          description: "Control de stock diario Procovar",
          lang: "es",
          theme_color: "#22261F",
          background_color: "#F7F4EC",
          display: "standalone",
          start_url: base,
          icons: [
            { src: "icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
      }),
    ],
  };
});
