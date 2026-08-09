import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode, isPreview }) => {
  // Both `vite build` and `vite preview` report mode "production"; only `vite dev`
  // is "development". isPreview is included too so an explicit --mode override on
  // build (e.g. a debug build) can't silently reset the GitHub Pages base to "/".
  const base = mode === "production" || isPreview ? "/inventario-procovar/" : "/";

  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["icon-192.png", "icon-512.png"],
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
