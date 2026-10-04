// Reduce una foto elegida (cámara o galería) antes de guardarla: una foto de
// teléfono pesa varios MB y 800 px de lado largo alcanzan de sobra para
// WhatsApp. Sale en JPEG (unos 60-100 KB).

export const PHOTO_MAX_SIDE = 800;
const PHOTO_QUALITY = 0.8;

// Tamaño final: el lado más largo queda en `max`, se conserva la proporción
// y nunca se agranda una imagen que ya es más chica.
export function fitWithin(width, height, max = PHOTO_MAX_SIDE) {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

// Lee la imagen respetando la orientación del EXIF (las fotos de cámara
// vienen "de lado" y el navegador las endereza al dibujarlas).
function loadImage(file) {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file, { imageOrientation: "from-image" });
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No es una imagen válida.")); };
    img.src = url;
  });
}

export async function resizeImageFile(file, { max = PHOTO_MAX_SIDE, quality = PHOTO_QUALITY } = {}) {
  const image = await loadImage(file);
  const sourceWidth = image.width || image.naturalWidth;
  const sourceHeight = image.height || image.naturalHeight;
  const { width, height } = fitWithin(sourceWidth, sourceHeight, max);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  // Fondo blanco: un PNG con transparencia saldría negro al pasar a JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  if (typeof image.close === "function") image.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo reducir la foto."))),
      "image/jpeg",
      quality
    );
  });
}
