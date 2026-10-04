import { useState, useEffect, useRef, useCallback } from "react";
import { resizeImageFile } from "./imageResize";
import {
  isProductImageStoreAvailable, putProductImage, getProductImage, deleteProductImage, listProductImageCodes,
} from "./productImageStore";

// Fotos de los productos para la interfaz: `urls` (código -> dirección
// temporal para mostrarla en <img>), y las acciones de guardar, quitar y
// leer la foto original para compartirla. Todo vive en IndexedDB
// (productImageStore.js), no en el estado de la app ni en los respaldos.
// Sin IndexedDB (navegación privada, navegador viejo) la app sigue igual,
// solo que sin fotos.
export function useProductImages() {
  const [urls, setUrls] = useState({});
  const urlsRef = useRef({});

  const apply = useCallback((next) => {
    urlsRef.current = next;
    setUrls(next);
  }, []);

  useEffect(() => {
    if (!isProductImageStoreAvailable()) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const codes = await listProductImageCodes();
        const loaded = {};
        for (const code of codes) {
          const blob = await getProductImage(code);
          if (blob) loaded[code] = URL.createObjectURL(blob);
        }
        if (cancelled) {
          Object.values(loaded).forEach((url) => URL.revokeObjectURL(url));
          return;
        }
        apply({ ...urlsRef.current, ...loaded });
      } catch {
        // Sin fotos: la app funciona igual.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apply]);

  useEffect(() => () => {
    Object.values(urlsRef.current).forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const savePhoto = useCallback(async (code, file) => {
    if (!isProductImageStoreAvailable()) {
      return { ok: false, error: "Este navegador no puede guardar fotos." };
    }
    try {
      const blob = await resizeImageFile(file);
      await putProductImage(code, blob);
      const previous = urlsRef.current[code];
      if (previous) URL.revokeObjectURL(previous);
      apply({ ...urlsRef.current, [code]: URL.createObjectURL(blob) });
      return { ok: true };
    } catch {
      return { ok: false, error: "No se pudo guardar la foto. Prueba con otra imagen." };
    }
  }, [apply]);

  const removePhoto = useCallback(async (code) => {
    try {
      await deleteProductImage(code);
    } catch {
      return { ok: false };
    }
    const previous = urlsRef.current[code];
    if (previous) URL.revokeObjectURL(previous);
    const { [code]: _removed, ...rest } = urlsRef.current;
    apply(rest);
    return { ok: true };
  }, [apply]);

  const getBlob = useCallback(async (code) => {
    try {
      return await getProductImage(code);
    } catch {
      return null;
    }
  }, []);

  return { urls, savePhoto, removePhoto, getBlob };
}
