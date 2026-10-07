import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useEnteringIds from "./useEnteringIds";

// Detecta qué ids aparecen DESPUÉS de la primera vez (un pedido recién
// creado), por un rato, para resaltarlos. Lo que ya estaba al abrir la
// pestaña no cuenta, ni una carga masiva (un respaldo importado).

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("useEnteringIds", () => {
  it("lo que ya estaba al montar no es nuevo", () => {
    const { result } = renderHook(() => useEnteringIds(["a", "b"], 1000));
    expect(result.current.size).toBe(0);
  });

  it("un id que aparece después es nuevo y deja de serlo pasado el tiempo", () => {
    const { result, rerender } = renderHook(({ ids }) => useEnteringIds(ids, 1000), { initialProps: { ids: ["a"] } });
    rerender({ ids: ["a", "b"] });
    expect([...result.current]).toEqual(["b"]);
    act(() => { vi.advanceTimersByTime(1001); });
    expect(result.current.size).toBe(0);
  });

  it("si el id sigue estando, no vuelve a marcarse", () => {
    const { result, rerender } = renderHook(({ ids }) => useEnteringIds(ids, 1000), { initialProps: { ids: ["a"] } });
    rerender({ ids: ["a", "b"] });
    act(() => { vi.advanceTimersByTime(1001); });
    rerender({ ids: ["a", "b"] });
    rerender({ ids: ["b", "a"] });
    expect(result.current.size).toBe(0);
  });

  it("un id que se va y vuelve (deshacer eliminar) no cuenta como nuevo", () => {
    const { result, rerender } = renderHook(({ ids }) => useEnteringIds(ids, 1000), { initialProps: { ids: ["a", "b"] } });
    rerender({ ids: ["a"] });
    rerender({ ids: ["a", "b"] });
    expect(result.current.size).toBe(0);
  });

  it("una carga masiva (más de 3 de golpe) no se resalta", () => {
    const { result, rerender } = renderHook(({ ids }) => useEnteringIds(ids, 1000), { initialProps: { ids: [] } });
    rerender({ ids: ["a", "b", "c", "d"] });
    expect(result.current.size).toBe(0);
  });

  it("sin animación (ms = 0) nunca marca nada", () => {
    const { result, rerender } = renderHook(({ ids }) => useEnteringIds(ids, 0), { initialProps: { ids: ["a"] } });
    rerender({ ids: ["a", "b"] });
    expect(result.current.size).toBe(0);
  });
});
