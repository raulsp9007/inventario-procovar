import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import UpdateBanner from "./UpdateBanner";

// Barra fija arriba: avisa que hay una versión nueva. Actualizar la aplica y
// la × la oculta; nunca recarga nada por su cuenta.

describe("UpdateBanner", () => {
  it("avisa que hay una versión nueva y sugiere actualizar al terminar", () => {
    render(<UpdateBanner onUpdate={() => {}} onDismiss={() => {}} />);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("Hay una versión nueva")).toBeTruthy();
    expect(screen.getByText("Actualiza cuando termines lo que haces.")).toBeTruthy();
  });

  it("Actualizar llama a onUpdate", () => {
    const onUpdate = vi.fn();
    render(<UpdateBanner onUpdate={onUpdate} onDismiss={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("la × (Después) llama a onDismiss y no a onUpdate", () => {
    const onUpdate = vi.fn();
    const onDismiss = vi.fn();
    render(<UpdateBanner onUpdate={onUpdate} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "Después" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("queda fija arriba al desplazarse", () => {
    render(<UpdateBanner onUpdate={() => {}} onDismiss={() => {}} />);
    const bar = screen.getByRole("status");
    expect(bar.style.position).toBe("sticky");
    expect(bar.style.top).toBe("0px");
  });
});
