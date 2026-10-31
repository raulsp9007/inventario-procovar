import { describe, it, expect } from "vitest";
import { parseCsv } from "./csv";

// Lector de CSV (RFC 4180) para importar listas desde Excel o desde el portal:
// campos entrecomillados con comas, comillas dobles y saltos de línea dentro,
// BOM de UTF-8, finales de línea de Windows y separador "," o ";".

describe("parseCsv", () => {
  it("filas y columnas simples", () => {
    expect(parseCsv("a,b,c\n1,2,3\n4,5,6")).toEqual([["a", "b", "c"], ["1", "2", "3"], ["4", "5", "6"]]);
  });

  it("finales de línea de Windows y línea final vacía", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("quita el BOM de UTF-8 del principio", () => {
    expect(parseCsv("﻿a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("un campo entrecomillado puede llevar comas", () => {
    expect(parseCsv('a,b\n"Calle 1, entre 2 y 3",x')).toEqual([["a", "b"], ["Calle 1, entre 2 y 3", "x"]]);
  });

  it("un campo entrecomillado puede llevar saltos de línea", () => {
    expect(parseCsv('a,b\n"línea 1\nlínea 2",x\n"otra\r\nvez",y')).toEqual([["a", "b"], ["línea 1\nlínea 2", "x"], ["otra\r\nvez", "y"]]);
  });

  it('comillas dobles escapadas ("")', () => {
    expect(parseCsv('a\n"dijo ""hola"""')).toEqual([["a"], ['dijo "hola"']]);
  });

  it("campos vacíos al principio, al medio y al final", () => {
    expect(parseCsv("a,b,c\n1,,3\n,2,")).toEqual([["a", "b", "c"], ["1", "", "3"], ["", "2", ""]]);
  });

  it("una fila con solo separadores (fila vacía de Excel) se ignora", () => {
    expect(parseCsv("a,b,c\n,,\n1,2,3")).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
  });

  it("detecta el punto y coma (Excel en español)", () => {
    expect(parseCsv('a;b;c\n1;"x;y";3')).toEqual([["a", "b", "c"], ["1", "x;y", "3"]]);
  });

  it("la coma no se confunde con punto y coma si el encabezado trae comas", () => {
    expect(parseCsv("a,b;c\n1,2;3")).toEqual([["a", "b;c"], ["1", "2;3"]]);
  });

  it("ignora filas totalmente vacías", () => {
    expect(parseCsv("a,b\n\n1,2\n\n\n3,4\n")).toEqual([["a", "b"], ["1", "2"], ["3", "4"]]);
  });

  it("un archivo vacío no da filas", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("﻿\n")).toEqual([]);
  });

  it("una comilla que nunca se cierra no se queda colgada: toma lo que haya", () => {
    expect(parseCsv('a,b\n"sin cerrar,x')).toEqual([["a", "b"], ["sin cerrar,x"]]);
  });

  it("conserva los espacios dentro de los campos", () => {
    expect(parseCsv("a,b\n  x  ,y ")).toEqual([["a", "b"], ["  x  ", "y "]]);
  });
});
