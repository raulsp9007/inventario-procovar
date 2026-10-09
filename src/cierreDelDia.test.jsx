import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

// Pedidos > Hoy > "Cierre del día": pantalla de repaso antes de cerrar el día
// (pedidos pendientes, metas, ventas, stock para mañana y respaldo), con el
// botón para mandar el resumen al supervisor. Solo lee datos; no cierra nada.

const { shareBackup } = vi.hoisted(() => ({ shareBackup: vi.fn() }));
vi.mock("./backup", async (importOriginal) => ({ ...(await importOriginal()), shareBackup }));

const STORAGE_KEY = "procovar-inventario-v1";
const SUPERVISOR = "5355512345";

const products = [
  { code: "P500", name: "Parranda 500ml", short: "P-500", color: "#C77A2E", hl: 0.005, format: "Sixpack", inGoals: true },
  { code: "P1500", name: "Parranda 1500ml", short: "P-1500", color: "#E0A040", hl: 0.015, format: "Sixpack", inGoals: true },
];

function line(id, code, qty, orderId, seq, name, extra = {}) {
  return {
    id: `m-${id}`, code, type: "venta", qty, unitPrice: 100, unitHl: 0.03, date: "2026-09-21",
    timestamp: `2026-09-21T0${seq}:00:00.000Z`, orderId, orderSeq: seq, customerName: name,
    businessName: "", customerPhone: "5353551234", isDelivery: false, note: "",
    bucket: "hoy", sent: false, confirmed: false, sentToCustomer: false, ...extra,
  };
}

const PENDING_MOVEMENTS = [
  line(1, "P500", 40, "o1", 1, "Ana", { sent: true, confirmed: true }),
  line(2, "P500", 30, "o2", 2, "Beto", { sent: true }),
  line(3, "P1500", 20, "o3", 3, "Marta", { isDelivery: true }),
  line(4, "P1500", 60, "r1", 4, "Luis", { bucket: "manana", date: "2026-09-22" }), // reserva de mañana
];

function seed(movements = PENDING_MOVEMENTS, extra = {}) {
  localStorage.setItem("procovar-active-tab", "pedidos");
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products, movements, customers: [], orderSeqPerDay: true,
    lastBackupAt: "2026-09-18T08:00:00", // hace 3 días
    stock: { P500: 100, P1500: 40 }, prices: { P500: 1, P1500: 1 }, pricesAreUsd: false, exchangeRate: 100,
    productFormats: [{ code: "Sixpack", units: 6 }], hlPerFormatMigrated: true, goalProductsMigrated: true,
    dailyBlisterGoal: 100, dailyHlGoal: 3, hlGoal: 300, supervisorPhone: SUPERVISOR, senderName: "Raúl",
    ...extra,
  }));
}

async function openCierre() {
  const { default: InventoryApp } = await import("./InventoryApp");
  render(<InventoryApp />);
  fireEvent.click(await screen.findByRole("button", { name: "Cierre del día" }));
  return await screen.findByRole("dialog", { name: "Cierre del día" });
}

let openSpy;

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = () => {};
  shareBackup.mockReset().mockResolvedValue("shared");
  openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-21T15:00:00")); // lunes fijo
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Cierre del día: abrir y cerrar", () => {
  it("el botón está en Pedidos > Hoy y abre la pantalla", async () => {
    seed();
    const dialog = await openCierre();
    expect(within(dialog).getByRole("heading", { name: "Cierre del día" })).toBeTruthy();
  });

  it("no está en la pestaña Para mañana", async () => {
    seed();
    const { default: InventoryApp } = await import("./InventoryApp");
    render(<InventoryApp />);
    await screen.findByRole("button", { name: "Cierre del día" });
    fireEvent.click(screen.getByRole("button", { name: /^Para mañana/ }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Cierre del día" })).toBeNull());
  });

  it("Volver la cierra", async () => {
    seed();
    const dialog = await openCierre();
    fireEvent.click(within(dialog).getByRole("button", { name: "Volver" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Cierre del día" })).toBeNull());
  });
});

describe("Cierre del día: con pendientes", () => {
  it("muestra el avance y cuántas cosas faltan", async () => {
    seed();
    const dialog = await openCierre();
    expect(within(dialog).getByText("Faltan 3 cosas antes de cerrar")).toBeTruthy();
    expect(within(dialog).getByText("0 de 3")).toBeTruthy();
    expect(within(dialog).queryByText("Todo en orden")).toBeNull();
  });

  it("Pedidos: cuenta facturados y confirmados y lista lo que falta por facturar", async () => {
    seed();
    const dialog = await openCierre();
    expect(within(dialog).getByText("2 de 3 facturados · 1 de 3 confirmados")).toBeTruthy();
    expect(within(dialog).getByText(/Marta/)).toBeTruthy();
    expect(within(dialog).getByText("SIN SUP.")).toBeTruthy(); // domicilio: el paso se llama Supervisor
    expect(within(dialog).queryByText(/Ana/)).toBeNull(); // ya facturado
  });

  it("Pedidos: tocar un pendiente lleva a la pestaña Pedidos", async () => {
    seed();
    const dialog = await openCierre();
    fireEvent.click(within(dialog).getByText(/Marta/));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Cierre del día" })).toBeNull());
    expect(screen.getByRole("button", { name: "Pedidos" }).getAttribute("aria-current")).toBe("page");
  });

  it("Metas: blísteres y HL contra la meta del día, y el HL del mes", async () => {
    seed();
    const dialog = await openCierre();
    expect(within(dialog).getByText("70")).toBeTruthy(); // 40 + 30 blísteres facturados
    expect(within(dialog).getByText("de 100")).toBeTruthy();
    expect(within(dialog).getByText(/Meta del mes: 2\.1 de 300 hL \(1%\)/)).toBeTruthy();
  });

  it("Ventas: total facturado en CUP", async () => {
    seed();
    const dialog = await openCierre();
    expect(within(dialog).getByText("7000 CUP")).toBeTruthy(); // 70 uds x 100
    expect(within(dialog).getByText("2 pedidos facturados · 70 unidades")).toBeTruthy();
  });

  it("Stock para mañana: avisa del producto que no alcanza", async () => {
    seed();
    const dialog = await openCierre();
    expect(within(dialog).getByText("1 producto no alcanza para lo reservado")).toBeTruthy();
    expect(within(dialog).getByText("P-1500")).toBeTruthy();
    expect(within(dialog).getByText("Quedan 40 · reservado mañana 60")).toBeTruthy();
    expect(within(dialog).getByText("faltan 20")).toBeTruthy();
  });

  it("Respaldo: dice hace cuántos días y deja compartirlo desde ahí", async () => {
    seed();
    const dialog = await openCierre();
    expect(within(dialog).getByText("Último respaldo: hace 3 días")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Compartir" }));
    await waitFor(() => expect(shareBackup).toHaveBeenCalledTimes(1));
    expect(await within(dialog).findByText("Respaldo compartido hoy")).toBeTruthy();
    expect(within(dialog).getByText("Faltan 2 cosas antes de cerrar")).toBeTruthy();
  });

  it("Enviar resumen al supervisor abre WhatsApp con los pedidos de hoy", async () => {
    seed();
    const dialog = await openCierre();
    fireEvent.click(within(dialog).getByRole("button", { name: "Enviar resumen al supervisor" }));
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy.mock.calls[0][0].startsWith(`https://wa.me/${SUPERVISOR}?text=`)).toBe(true);
    const text = decodeURIComponent(openSpy.mock.calls[0][0].split("?text=")[1]);
    expect(text).toContain("*Pedidos del día · lun 21 sep*");
    expect(text).toContain("*Marta*");
    expect(text).not.toContain("*Luis*"); // la reserva de mañana no es de hoy
  });
});

describe("Cierre del día: todo en orden", () => {
  it("sin pendientes lo dice y marca las tres cosas", async () => {
    seed(
      [line(1, "P500", 40, "o1", 1, "Ana", { sent: true, confirmed: true })],
      { lastBackupAt: "2026-09-21T09:00:00" },
    );
    const dialog = await openCierre();
    expect(within(dialog).getByText("Todo listo para cerrar")).toBeTruthy();
    expect(within(dialog).getByText("3 de 3")).toBeTruthy();
    expect(within(dialog).getByText("Todo en orden")).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Compartir" })).toBeNull();
  });

  it("sin metas definidas no inventa porcentajes", async () => {
    seed(
      [line(1, "P500", 40, "o1", 1, "Ana", { sent: true, confirmed: true })],
      { dailyBlisterGoal: null, dailyHlGoal: null, hlGoal: null, lastBackupAt: "2026-09-21T09:00:00" },
    );
    const dialog = await openCierre();
    expect(within(dialog).getByText("Sin metas definidas")).toBeTruthy();
  });
});
