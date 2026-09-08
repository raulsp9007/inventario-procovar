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
  it("muestra las 6 pestañas siempre visibles, sin necesidad de abrir nada", () => {
    render(<RadialNav view="pedidos" setView={() => {}} />);
    const productosBtn = screen.getByRole("button", { name: "Productos" });
    expect(productosBtn).toBeInTheDocument();
  });

  it("tocar una pestaña la selecciona", async () => {
    const user = userEvent.setup();
    const setView = vi.fn();
    render(<RadialNav view="pedidos" setView={setView} />);

    await user.click(screen.getByRole("button", { name: "Productos" }));
    expect(setView).toHaveBeenCalledWith("stock");
  });

  it("marca la pestaña activa con color distinto", () => {
    render(<RadialNav view="clientes" setView={() => {}} />);

    const clientesBtn = screen.getByRole("button", { name: "Clientes" });
    const pedidosBtn = screen.getByRole("button", { name: "Pedidos" });
    expect(clientesBtn.style.color).not.toBe(pedidosBtn.style.color);
    expect(clientesBtn).toHaveAttribute("aria-current", "page");
    expect(pedidosBtn).not.toHaveAttribute("aria-current");
  });
});
