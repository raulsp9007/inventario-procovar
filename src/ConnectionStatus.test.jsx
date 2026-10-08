import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ConnectionStatus from "./ConnectionStatus";

describe("ConnectionStatus", () => {
  it("sin conexión: manda por encima de todo lo demás", () => {
    render(<ConnectionStatus offline updateAvailable lastOnlineAt="2026-09-20T10:00:00.000Z" />);
    expect(screen.getByText("Sin conexión")).toBeTruthy();
    expect(screen.getByText(/Usando la última versión guardada/)).toBeTruthy();
    expect(screen.queryByText("Hay una versión nueva")).toBeNull();
    expect(screen.queryByText("App actualizada")).toBeNull();
  });

  it("sin conexión, sin fecha registrada: no inventa una fecha", () => {
    render(<ConnectionStatus offline updateAvailable={false} lastOnlineAt={null} />);
    expect(screen.getByText("Usando la última versión guardada.")).toBeTruthy();
  });

  it("con conexión y actualización pendiente: avisa y deja actualizar cuando se quiera", () => {
    const onUpdate = vi.fn();
    render(<ConnectionStatus offline={false} updateAvailable lastOnlineAt="2026-09-20T10:00:00.000Z" onUpdate={onUpdate} />);
    expect(screen.getByText("Hay una versión nueva")).toBeTruthy();
    expect(screen.getByText("Actualiza cuando termines lo que haces.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Actualizar ahora" }));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("muestra la versión de la app cuando se conoce, en cualquier estado", () => {
    const { rerender } = render(<ConnectionStatus offline={false} updateAvailable={false} lastOnlineAt={null} version="abc1234" />);
    expect(screen.getByText("Versión abc1234")).toBeTruthy();
    rerender(<ConnectionStatus offline updateAvailable={false} lastOnlineAt={null} version="abc1234" />);
    expect(screen.getByText("Versión abc1234")).toBeTruthy();
    rerender(<ConnectionStatus offline={false} updateAvailable lastOnlineAt={null} version="abc1234" />);
    expect(screen.getByText("Versión abc1234")).toBeTruthy();
  });

  it("sin versión no dibuja la línea", () => {
    render(<ConnectionStatus offline={false} updateAvailable={false} lastOnlineAt={null} />);
    expect(screen.queryByText(/^Versión/)).toBeNull();
  });

  it("sin actualización pendiente no hay botón de actualizar", () => {
    render(<ConnectionStatus offline={false} updateAvailable={false} lastOnlineAt={null} onUpdate={() => {}} />);
    expect(screen.queryByRole("button", { name: "Actualizar ahora" })).toBeNull();
  });

  it("al día: sin conexión pendiente ni actualización, con la última conexión si se conoce", () => {
    render(<ConnectionStatus offline={false} updateAvailable={false} lastOnlineAt="2026-09-20T10:00:00.000Z" />);
    expect(screen.getByText("App actualizada")).toBeTruthy();
    expect(screen.getByText(/Última conexión/)).toBeTruthy();
  });

  it("al día sin fecha conocida: no muestra subtítulo vacío", () => {
    render(<ConnectionStatus offline={false} updateAvailable={false} lastOnlineAt={null} />);
    expect(screen.getByText("App actualizada")).toBeTruthy();
    expect(screen.queryByText(/Última conexión/)).toBeNull();
  });
});
