import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Today from "./Today";

// El "% de la meta diaria" solo se muestra con una meta numérica positiva;
// con cualquier otra cosa (sin meta, 0, datos raros de un respaldo
// importado) no se muestra nada, en vez de "NaN%".

const products = [{ code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.005 }];
const movements = [
  { id: "m1", code: "P500", type: "venta", qty: 10, unitPrice: 100, unitHl: 0.005, sent: true, orderId: "o1" },
];

function renderToday(dailyHlGoal) {
  return render(<Today products={products} movements={movements} stock={{ P500: 5 }} showPrices={false} dailyHlGoal={dailyHlGoal} />);
}

describe("% de la meta diaria de HL", () => {
  it("con una meta numérica muestra el porcentaje", () => {
    renderToday(0.1); // vendido 0.05 hl -> 50 %
    expect(screen.getByText("50% de la meta diaria")).toBeTruthy();
  });

  it.each([
    ["sin meta (null)", null],
    ["meta 0", 0],
    ["un objeto (dato raro de un respaldo)", {}],
    ["un texto", "abc"],
    ["NaN", NaN],
    ["negativa", -5],
  ])("%s: no muestra nada (nunca NaN%)", (_nombre, meta) => {
    const { container } = renderToday(meta);
    expect(container.textContent).not.toMatch(/meta diaria/);
    expect(container.textContent).not.toMatch(/NaN/);
  });
});
