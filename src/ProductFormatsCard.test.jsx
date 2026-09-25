import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProductFormatsCard from "./ProductFormatsCard";

const formats = [{ code: "sixpack", units: 6 }, { code: "docena", units: 12 }];

describe("ProductFormatsCard", () => {
  it("lista los formatos con sus unidades", () => {
    render(<ProductFormatsCard formats={formats} products={[]} onSaveProductFormat={() => {}} onDeleteProductFormat={() => {}} />);
    expect(screen.getByText("sixpack")).toBeTruthy();
    expect(screen.getByText("6 uds")).toBeTruthy();
    expect(screen.getByText("docena")).toBeTruthy();
  });

  it("marca 'En uso' solo el formato que algún producto tiene puesto", () => {
    render(<ProductFormatsCard formats={formats} products={[{ code: "P1", name: "Uno", format: "sixpack" }]} onSaveProductFormat={() => {}} onDeleteProductFormat={() => {}} />);
    const sixpackRow = screen.getByText("sixpack").closest("div").parentElement;
    expect(sixpackRow.textContent).toMatch(/En uso/);
    const docenaRow = screen.getByText("docena").closest("div").parentElement;
    expect(docenaRow.textContent).not.toMatch(/En uso/);
  });

  it("agrega un formato nuevo con nombre y unidades", () => {
    const onSave = vi.fn();
    render(<ProductFormatsCard formats={formats} products={[]} onSaveProductFormat={onSave} onDeleteProductFormat={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("Nombre (ej: docena)"), { target: { value: "media docena" } });
    fireEvent.change(screen.getByPlaceholderText("Uds"), { target: { value: "6" } });
    fireEvent.click(screen.getByLabelText("Agregar formato"));
    expect(onSave).toHaveBeenCalledWith({ code: "media docena", units: "6" });
  });

  it("no agrega si falta el nombre o las unidades", () => {
    const onSave = vi.fn();
    render(<ProductFormatsCard formats={formats} products={[]} onSaveProductFormat={onSave} onDeleteProductFormat={() => {}} />);
    fireEvent.click(screen.getByLabelText("Agregar formato"));
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText("Nombre (ej: docena)"), { target: { value: "algo" } });
    fireEvent.click(screen.getByLabelText("Agregar formato"));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("edita las unidades de un formato existente", () => {
    const onSave = vi.fn();
    render(<ProductFormatsCard formats={formats} products={[]} onSaveProductFormat={onSave} onDeleteProductFormat={() => {}} />);
    fireEvent.click(screen.getByLabelText("Editar unidades de sixpack"));
    const input = screen.getByLabelText("Guardar unidades de sixpack").parentElement.querySelector("input");
    fireEvent.change(input, { target: { value: "8" } });
    fireEvent.click(screen.getByLabelText("Guardar unidades de sixpack"));
    expect(onSave).toHaveBeenCalledWith({ code: "sixpack", units: "8" });
  });

  it("cancelar la edición no llama a onSaveProductFormat", () => {
    const onSave = vi.fn();
    render(<ProductFormatsCard formats={formats} products={[]} onSaveProductFormat={onSave} onDeleteProductFormat={() => {}} />);
    fireEvent.click(screen.getByLabelText("Editar unidades de sixpack"));
    fireEvent.click(screen.getByLabelText("Cancelar"));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Editar unidades de sixpack")).toBeTruthy();
  });

  it("eliminar llama a onDeleteProductFormat con el código", () => {
    const onDelete = vi.fn();
    render(<ProductFormatsCard formats={formats} products={[]} onSaveProductFormat={() => {}} onDeleteProductFormat={onDelete} />);
    fireEvent.click(screen.getByLabelText("Eliminar formato docena"));
    expect(onDelete).toHaveBeenCalledWith("docena");
  });

  it("sin formatos, muestra un mensaje en vez de una lista vacía", () => {
    render(<ProductFormatsCard formats={[]} products={[]} onSaveProductFormat={() => {}} onDeleteProductFormat={() => {}} />);
    expect(screen.getByText("Todavía no hay formatos.")).toBeTruthy();
  });
});
