import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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

  it("con conexión y actualización pendiente: avisa sin pedir acción", () => {
    render(<ConnectionStatus offline={false} updateAvailable lastOnlineAt="2026-09-20T10:00:00.000Z" />);
    expect(screen.getByText("Hay una versión nueva")).toBeTruthy();
    expect(screen.getByText("Se aplica sola al volver a abrir la app.")).toBeTruthy();
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
