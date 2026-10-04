import { formatCUP, formatUSD, priceToCUP } from "./money";
import { getFormat, unitPrice } from "./productFormats";

// Texto de pie de foto al compartir un producto por WhatsApp: nombre en
// negrita (*...* es la negrita de WhatsApp), precio del formato completo y
// precio por unidad. `price` es el precio guardado: USD si hay tasa, CUP
// directo si no (misma regla que priceToCUP) -- sin tasa no hay USD que
// mostrar. Sin precio (o sin formato) se omiten las líneas que no aplican.
export function formatProductForShare({ product, price, formats, exchangeRate }) {
  const lines = [`*${product.name}*`];
  const n = Number(price) || 0;
  if (n <= 0) return lines.join("\n");

  const hasRate = !!exchangeRate && exchangeRate > 0;
  const withUsd = (cup, usd) => `${formatCUP(cup)}${hasRate && usd != null ? ` · ${formatUSD(usd)}` : ""}`;
  const format = getFormat(formats, product.format);
  if (format) {
    lines.push(`${format.code} (${format.units} uds): ${withUsd(priceToCUP(n, exchangeRate), n)}`);
    const unit = unitPrice(formats, n, product.format, exchangeRate);
    if (unit) lines.push(`Por unidad: ${withUsd(unit.cup, unit.usd)}`);
  } else {
    lines.push(`Precio: ${withUsd(priceToCUP(n, exchangeRate), n)}`);
  }
  return lines.join("\n");
}

function fileNameFor(name) {
  const slug = (name || "producto")
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "producto"}.jpg`;
}

// WhatsApp no deja adjuntar imágenes por enlace (wa.me solo lleva texto): la
// foto sale por el menú de compartir del teléfono (Web Share API), que abre
// WhatsApp con la imagen y el texto puestos; la persona elige el chat. Si el
// navegador no puede compartir archivos, se descarga la foto y se abre
// WhatsApp con el texto, para adjuntarla a mano.
// Devuelve "shared", "cancelled" (cerró el menú) o "fallback".
export async function shareProductPhoto({ blob, caption, name }) {
  const file = new File([blob], fileNameFor(name), { type: blob.type || "image/jpeg" });
  const canShareFiles =
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] });

  if (canShareFiles) {
    try {
      await navigator.share({ files: [file], text: caption });
      return "shared";
    } catch (error) {
      if (error && error.name === "AbortError") return "cancelled";
      // Cualquier otro fallo (permiso, tamaño): se usa el respaldo.
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  window.open(`https://wa.me/?text=${encodeURIComponent(caption)}`, "_blank", "noopener,noreferrer");
  return "fallback";
}
