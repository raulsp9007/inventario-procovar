import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RadialNav, { VIEW_LABELS } from "./RadialNav";

describe("VIEW_LABELS", () => {
  it("tiene una etiqueta por cada pestaña, incluida Pedidos", () => {
    expect(VIEW_LABELS.pedidos).toBe("Pedidos");
    expect(VIEW_LABELS.config).toBe("Configuración");
    expect(Object.keys(VIEW_LABELS)).toHaveLength(6);
  });
});

describe("RadialNav", () => {
  it("arranca cerrado -- las pestañas no reciben clicks hasta abrir el menú", () => {
    const setView = vi.fn();
    render(<RadialNav view="pedidos" setView={setView} />);
    // Los botones de pestaña existen en el DOM (para animar la apertura)
    // pero no son interactuables mientras el menú está cerrado.
    const productosBtn = screen.getByRole("button", { name: "Productos" });
    expect(productosBtn).toHaveStyle({ pointerEvents: "none" });
  });

  it("al abrir el menú, tocar una pestaña la selecciona y cierra el menú", async () => {
    const user = userEvent.setup();
    const setView = vi.fn();
    render(<RadialNav view="pedidos" setView={setView} />);

    await user.click(screen.getByRole("button", { name: "Abrir menú" }));
    const productosBtn = screen.getByRole("button", { name: "Productos" });
    expect(productosBtn).toHaveStyle({ pointerEvents: "auto" });

    await user.click(productosBtn);
    expect(setView).toHaveBeenCalledWith("stock");
    // Vuelve a "Abrir menú" -- se cerró solo al elegir una pestaña.
    expect(screen.getByRole("button", { name: "Abrir menú" })).toBeInTheDocument();
  });

  it("marca la pestaña activa con background distinto", async () => {
    const user = userEvent.setup();
    render(<RadialNav view="clientes" setView={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Abrir menú" }));

    const clientesBtn = screen.getByRole("button", { name: "Clientes" });
    const pedidosBtn = screen.getByRole("button", { name: "Pedidos" });
    expect(clientesBtn.style.background).not.toBe(pedidosBtn.style.background);
  });
});
