import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import AppRoot from "./AppRoot";

// La raíz elige qué app mostrar según el rol del teléfono (appRole.js).

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("AppRoot", () => {
  it("por defecto muestra la app del vendedor", async () => {
    localStorage.setItem("procovar-active-tab", "config");
    render(<AppRoot />);
    expect(await screen.findByText("CONFIGURACIÓN")).toBeTruthy();
    expect(screen.queryByText("Enlazar facturación")).toBeNull();
  });

  it("con rol facturadora (guardado) muestra la app de la facturadora", async () => {
    localStorage.setItem("procovar-rol", "facturadora");
    render(<AppRoot />);
    expect(await screen.findByText("Enlazar facturación")).toBeTruthy();
  });

  it("con ?rol=facturadora en la dirección también, y lo recuerda", async () => {
    window.history.replaceState(null, "", "/?rol=facturadora");
    render(<AppRoot />);
    expect(await screen.findByText("Enlazar facturación")).toBeTruthy();
    expect(localStorage.getItem("procovar-rol")).toBe("facturadora");
  });
});
