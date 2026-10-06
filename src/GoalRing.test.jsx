import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import GoalRing from "./GoalRing";

// Indicador de meta: anillo de 40 segmentos que se encienden según el avance,
// con el número al centro y la meta (tocable) debajo.

function ring(props = {}) {
  const onGoalChange = vi.fn();
  const utils = render(
    <GoalRing
      label="Blísteres diarios (cerveza y malta)"
      lines={["Blísteres", "diarios"]}
      value={142}
      goal={200}
      decimals={0}
      color="var(--orange)"
      parseGoal={(raw) => parseInt(raw, 10)}
      onGoalChange={onGoalChange}
      {...props}
    />
  );
  return { ...utils, onGoalChange };
}

const lit = (container) => container.querySelectorAll('line[data-lit="true"]').length;

describe("GoalRing: dibujo", () => {
  it("enciende los segmentos que corresponden al porcentaje (40 en total)", () => {
    const { container } = ring(); // 71 % -> 28 de 40
    expect(container.querySelectorAll("line[data-segment]")).toHaveLength(40);
    expect(lit(container)).toBe(28);
  });

  it("al llegar o pasarse de la meta quedan los 40 encendidos", () => {
    expect(lit(ring({ value: 200 }).container)).toBe(40);
    expect(lit(ring({ value: 500 }).container)).toBe(40);
  });

  it("sin avance no enciende ninguno", () => {
    expect(lit(ring({ value: 0 }).container)).toBe(0);
  });

  it("sin meta no enciende ninguno y lo dice", () => {
    const { container } = ring({ goal: null });
    expect(lit(container)).toBe(0);
    expect(screen.getByText("sin meta")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Blísteres diarios (cerveza y malta): 142 sin meta");
  });

  it("muestra el número, la meta y el porcentaje; el real aunque pase de 100", () => {
    ring();
    expect(screen.getByText("142")).toBeTruthy();
    expect(screen.getByText("de 200")).toBeTruthy();
    expect(screen.getByText("71%")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Blísteres diarios (cerveza y malta): 142 de 200 (71%)");
  });

  it("pasarse de la meta muestra el porcentaje real", () => {
    ring({ value: 500, goal: 200 });
    expect(screen.getByText("250%")).toBeTruthy();
  });

  it("usa los decimales pedidos", () => {
    ring({ value: 9.6, goal: 13.7, decimals: 1, label: "HL diarios (cerveza y malta)" });
    expect(screen.getByText("9.6")).toBeTruthy();
    expect(screen.getByText("de 13.7")).toBeTruthy();
    expect(screen.getByText("70%")).toBeTruthy();
  });
});

describe("GoalRing: cambiar la meta", () => {
  const open = () => fireEvent.click(screen.getByRole("button", { name: "Cambiar meta de Blísteres diarios (cerveza y malta)" }));
  const input = () => screen.getByLabelText("Blísteres diarios (cerveza y malta)");

  it("el botón muestra la meta actual", () => {
    ring();
    expect(screen.getByRole("button", { name: "Cambiar meta de Blísteres diarios (cerveza y malta)" }).textContent).toContain("Meta 200");
  });

  it("sin meta el botón invita a fijarla", () => {
    ring({ goal: null });
    expect(screen.getByRole("button", { name: "Fijar meta de Blísteres diarios (cerveza y malta)" }).textContent).toContain("Fijar meta");
  });

  it("tocar la meta abre un campo con el valor actual; Enter la guarda", () => {
    const { onGoalChange } = ring();
    open();
    expect(input().value).toBe("200");
    fireEvent.change(input(), { target: { value: "250" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(onGoalChange).toHaveBeenCalledWith(250);
    expect(screen.queryByLabelText("Blísteres diarios (cerveza y malta)")).toBeNull();
  });

  it("Escape cancela sin guardar", () => {
    const { onGoalChange } = ring();
    open();
    fireEvent.change(input(), { target: { value: "999" } });
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(onGoalChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Cambiar meta/ })).toBeTruthy();
  });

  it("al salir del campo también se guarda", () => {
    const { onGoalChange } = ring();
    open();
    fireEvent.change(input(), { target: { value: "300" } });
    fireEvent.blur(input());
    expect(onGoalChange).toHaveBeenCalledWith(300);
  });

  it("el botón OK guarda y no guarda dos veces", () => {
    const { onGoalChange } = ring();
    open();
    fireEvent.change(input(), { target: { value: "260" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar meta de Blísteres diarios (cerveza y malta)" }));
    expect(onGoalChange).toHaveBeenCalledTimes(1);
    expect(onGoalChange).toHaveBeenCalledWith(260);
  });

  it("vacío, cero o negativo quita la meta", () => {
    for (const raw of ["", "0", "-5", "abc"]) {
      const { onGoalChange, unmount } = ring();
      open();
      fireEvent.change(input(), { target: { value: raw } });
      fireEvent.keyDown(input(), { key: "Enter" });
      expect(onGoalChange).toHaveBeenCalledWith(null);
      unmount();
    }
  });

  it("si no cambió nada no avisa", () => {
    const { onGoalChange } = ring();
    open();
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(onGoalChange).not.toHaveBeenCalled();
  });
});
