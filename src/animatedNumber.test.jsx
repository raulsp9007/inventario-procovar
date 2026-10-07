import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import AnimatedNumber from "./AnimatedNumber";
import { FILL_ANIMATION_MS } from "./motion";

// Cifras que cuentan hacia arriba: igual que los anillos, solo con movimiento
// normal; con "reducir movimiento" (o sin matchMedia) muestran el valor de una.

function stubReducedMotion(reduce) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query, addEventListener: () => {}, removeEventListener: () => {},
  }));
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  delete window.matchMedia;
});

describe("AnimatedNumber", () => {
  it("sin matchMedia muestra el valor de una", () => {
    const { container } = render(<AnimatedNumber value={1670} format={(n) => `${n} CUP`} />);
    expect(container.textContent).toBe("1670 CUP");
  });

  it("con 'reducir movimiento' muestra el valor de una", () => {
    stubReducedMotion(true);
    const { container } = render(<AnimatedNumber value={50} />);
    expect(container.textContent).toBe("50");
  });

  it("con movimiento normal arranca en 0, pasa por valores intermedios y termina exacto", async () => {
    stubReducedMotion(false);
    const { container } = render(<AnimatedNumber value={1000} format={(n) => `${n} CUP`} />);
    expect(container.textContent).toBe("0 CUP");

    await act(async () => { await vi.advanceTimersByTimeAsync(FILL_ANIMATION_MS / 2); });
    const mid = parseFloat(container.textContent);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1000);
    expect(Number.isInteger(mid)).toBe(true); // sin decimales sueltos mientras cuenta

    await act(async () => { await vi.advanceTimersByTimeAsync(FILL_ANIMATION_MS); });
    expect(container.textContent).toBe("1000 CUP");
  });

  it("si el valor cambia, cuenta desde el anterior hasta el nuevo", async () => {
    stubReducedMotion(false);
    const { container, rerender } = render(<AnimatedNumber value={100} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(FILL_ANIMATION_MS + 50); });
    expect(container.textContent).toBe("100");

    rerender(<AnimatedNumber value={200} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(FILL_ANIMATION_MS / 2); });
    const mid = parseFloat(container.textContent);
    expect(mid).toBeGreaterThan(100);
    expect(mid).toBeLessThan(200);

    await act(async () => { await vi.advanceTimersByTimeAsync(FILL_ANIMATION_MS); });
    expect(container.textContent).toBe("200");
  });

  it("si el valor final es entero, mientras cuenta no muestra decimales aunque se pidan", async () => {
    stubReducedMotion(false);
    const { container } = render(<AnimatedNumber value={1670} decimals={2} />);
    for (let i = 0; i < 6; i += 1) {
      await act(async () => { await vi.advanceTimersByTimeAsync(150); });
      expect(Number.isInteger(parseFloat(container.textContent))).toBe(true);
    }
  });

  it("respeta los decimales pedidos", async () => {
    stubReducedMotion(false);
    const { container } = render(<AnimatedNumber value={7.25} decimals={2} format={(n) => n.toFixed(2)} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(FILL_ANIMATION_MS + 50); });
    expect(container.textContent).toBe("7.25");
  });
});
