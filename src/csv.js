// Lector de CSV (RFC 4180) para importar listas (Excel, portal de pedidos):
// campos entrecomillados con comas, comillas dobles ("") y saltos de línea
// dentro, BOM de UTF-8, finales de línea de Windows y separador "," o ";".
// Devuelve las filas como listas de texto, sin las filas totalmente vacías.

// El separador se decide por la primera línea (fuera de comillas): el que más
// aparezca entre "," y ";". Sin ninguno, ",".
function detectDelimiter(text) {
  let inQuotes = false;
  let commas = 0;
  let semicolons = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === "\n" || ch === "\r")) break;
    else if (!inQuotes && ch === ",") commas += 1;
    else if (!inQuotes && ch === ";") semicolons += 1;
  }
  return semicolons > commas ? ";" : ",";
}

export function parseCsv(input) {
  const text = String(input || "").replace(/^﻿/, "");
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const endField = () => { row.push(field); field = ""; };
  const endRow = () => {
    endField();
    if (row.some((value) => value !== "")) rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false;
      } else {
        field += ch;
      }
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      endField();
    } else if (ch === "\r") {
      if (text[i + 1] === "\n") i += 1;
      endRow();
    } else if (ch === "\n") {
      endRow();
    } else {
      field += ch;
    }
    i += 1;
  }
  if (field !== "" || row.length > 0) endRow();
  return rows;
}
