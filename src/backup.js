import { todayStr } from "./dateUtils.js";

export function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function buildBackupFile(persistedState) {
  return new File([JSON.stringify(persistedState, null, 2)], `procovar-backup-${todayStr()}.json`, { type: "application/json" });
}

export function downloadBackup(persistedState) {
  downloadFile(buildBackupFile(persistedState));
}

// Menú de compartir del sistema (Android: Drive, WhatsApp, correo...) con el
// archivo adjunto. Devuelve "shared", "cancelled" (cerró el menú sin
// enviar) o "unsupported" (el navegador no puede compartir archivos).
export async function shareFile(file, { title, text } = {}) {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function" || typeof navigator.canShare !== "function") {
    return "unsupported";
  }
  try {
    if (!navigator.canShare({ files: [file] })) return "unsupported";
    await navigator.share({ files: [file], title, text });
    return "shared";
  } catch (e) {
    return e && e.name === "AbortError" ? "cancelled" : "unsupported";
  }
}

// Compartir el respaldo; si el navegador no puede, lo descarga. "cancelled"
// es el único caso en que NO se hizo el respaldo.
export async function shareBackup(persistedState) {
  const file = buildBackupFile(persistedState);
  const result = await shareFile(file, { title: "Respaldo Inventario Procovar", text: "Respaldo de Inventario Procovar" });
  if (result === "unsupported") {
    downloadFile(file);
    return "downloaded";
  }
  return result;
}

// Contactos (.vcf) para la agenda del teléfono. Mismo criterio: compartir y,
// si no se puede, descargar.
export async function shareContactsFile(vcfText) {
  const file = new File([vcfText], `procovar-clientes-${todayStr()}.vcf`, { type: "text/vcard" });
  const result = await shareFile(file, { title: "Clientes Procovar" });
  if (result === "unsupported") {
    downloadFile(file);
    return "downloaded";
  }
  return result;
}

export function parseBackupFile(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("El archivo no tiene el formato esperado.");
  }
  return parsed;
}
