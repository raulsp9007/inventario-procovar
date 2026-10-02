import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import SplashScreen, { SPLASH_MS } from "./SplashScreen";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("SplashScreen", () => {
  it("dura 2 segundos", () => {
    expect(SPLASH_MS).toBe(2000);
  });

  it("al abrir muestra el nombre, la barra de carga y la marca de agua", () => {
    render(<SplashScreen><div>contenido</div></SplashScreen>);
    expect(screen.getByRole("status", { name: "Cargando" })).toBeTruthy();
    expect(screen.getByText("Inventario Procovar")).toBeTruthy();
    expect(screen.getByText("Desarrollado por raulsp9007")).toBeTruthy();
  });

  it("la app ya está montada debajo mientras dura la pantalla de carga", () => {
    render(<SplashScreen><div>contenido</div></SplashScreen>);
    expect(screen.getByText("contenido")).toBeTruthy();
  });

  it("desaparece a los 2 segundos y deja la app", () => {
    render(<SplashScreen><div>contenido</div></SplashScreen>);
    act(() => { vi.advanceTimersByTime(SPLASH_MS - 1); });
    expect(screen.queryByRole("status", { name: "Cargando" })).toBeTruthy();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.queryByRole("status", { name: "Cargando" })).toBeNull();
    expect(screen.queryByText("Desarrollado por raulsp9007")).toBeNull();
    expect(screen.getByText("contenido")).toBeTruthy();
  });
});
