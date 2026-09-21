import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useInventoryStore } from "./useInventoryStore";

const STORAGE_KEY = "procovar-inventario-v1";
const PREV_KEY = "procovar-inventario-v1-prev";
const PREV_AT_KEY = "procovar-inventario-v1-prev-at";
const CORRUPT_KEY = "procovar-inventario-v1-corrupt";

beforeEach(() => {
  localStorage.clear();
});

async function renderLoadedStore() {
  const view = renderHook(() => useInventoryStore());
  await waitFor(() => expect(view.result.current.loaded).toBe(true));
  return view;
}

function orderInput(overrides = {}) {
  return {
    customerName: "Ana", businessName: "Cafetería", customerPhone: "55551234",
    isDelivery: false, note: "", lines: [{ code: "P500", qty: 2 }], bucket: "manana",
    ...overrides,
  };
}

function savedState() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY));
}

function legacyMovement(overrides) {
  return { id: "1", code: "P500", type: "venta", qty: 2, date: "2026-09-01", timestamp: "2026-09-01T10:00:00.000Z", orderId: "o1", ...overrides };
}

describe("registro de clientes en el store", () => {
  it("confirmOrder agrega al cliente al registro con negocio y teléfono normalizado", async () => {
    const { result } = await renderLoadedStore();
    act(() => { result.current.confirmOrder(orderInput()); });
    await waitFor(() => expect(result.current.customers).toHaveLength(1));
    expect(result.current.customers[0]).toMatchObject({ name: "Ana", businessName: "Cafetería", phone: "5355551234" });
    expect(savedState().customers[0].name).toBe("Ana");
  });

  it("borrar el último pedido NO borra al cliente", async () => {
    const { result } = await renderLoadedStore();
    act(() => { result.current.confirmOrder(orderInput()); });
    await waitFor(() => expect(result.current.movements.length).toBe(1));
    act(() => { result.current.deleteOrder(result.current.movements[0].orderId); });
    await waitFor(() => expect(result.current.movements.length).toBe(0));
    expect(result.current.customers).toHaveLength(1);
    expect(result.current.customers[0].phone).toBe("5355551234");
  });

  it("un pedido sin teléfono ni negocio no borra los guardados del cliente", async () => {
    const { result } = await renderLoadedStore();
    act(() => { result.current.confirmOrder(orderInput()); });
    await waitFor(() => expect(result.current.customers).toHaveLength(1));
    act(() => { result.current.confirmOrder(orderInput({ businessName: "", customerPhone: "" })); });
    await waitFor(() => expect(result.current.movements.length).toBe(2));
    expect(result.current.customers).toHaveLength(1);
    expect(result.current.customers[0]).toMatchObject({ businessName: "Cafetería", phone: "5355551234" });
  });

  it("editar un pedido viejo sin cambiar su teléfono no pisa el teléfono actual del cliente", async () => {
    const { result } = await renderLoadedStore();
    act(() => { result.current.confirmOrder(orderInput({ customerPhone: "55550000" })); });
    await waitFor(() => expect(result.current.movements.length).toBe(1));
    const oldOrderId = result.current.movements[0].orderId;

    // Un pedido más nuevo trae el número actual del cliente.
    act(() => { result.current.confirmOrder(orderInput({ customerPhone: "55559999" })); });
    await waitFor(() => expect(result.current.customers[0].phone).toBe("5355559999"));

    // Se abre el pedido VIEJO y se edita solo la cantidad: el formulario
    // reenvía el teléfono viejo que ese pedido traía.
    act(() => { result.current.editOrder(oldOrderId, orderInput({ customerPhone: "55550000", lines: [{ code: "P500", qty: 3 }] })); });
    await waitFor(() => expect(result.current.movements.some((m) => m.orderId === oldOrderId && m.qty === 3)).toBe(true));
    expect(result.current.customers[0].phone).toBe("5355559999");
  });

  it("editar un pedido cambiando el teléfono actualiza el registro", async () => {
    const { result } = await renderLoadedStore();
    act(() => { result.current.confirmOrder(orderInput()); });
    await waitFor(() => expect(result.current.movements.length).toBe(1));
    const orderId = result.current.movements[0].orderId;
    act(() => { result.current.editOrder(orderId, orderInput({ customerPhone: "55557777" })); });
    await waitFor(() => expect(result.current.customers[0].phone).toBe("5355557777"));
  });

  it("updateCustomer renombra en pedidos, registro y lista de espera, y edita el teléfono", async () => {
    const { result } = await renderLoadedStore();
    act(() => { result.current.confirmOrder(orderInput()); });
    await waitFor(() => expect(result.current.customers).toHaveLength(1));
    act(() => { result.current.addWaitlistEntry({ code: "M330", customerName: "Ana", qty: 4 }); });
    await waitFor(() => expect(result.current.waitlist).toHaveLength(1));

    act(() => { result.current.updateCustomer("Ana", "Ana López", "Bodega", "55550000"); });
    await waitFor(() => expect(result.current.customers[0].name).toBe("Ana López"));

    expect(result.current.customers).toHaveLength(1);
    expect(result.current.customers[0]).toMatchObject({ businessName: "Bodega", phone: "5355550000" });
    expect(result.current.movements[0]).toMatchObject({ customerName: "Ana López", businessName: "Bodega", customerPhone: "5355550000" });
    expect(result.current.waitlist[0].customerName).toBe("Ana López");
    const persisted = savedState();
    expect(persisted.customers[0].name).toBe("Ana López");
    expect(persisted.waitlist[0].customerName).toBe("Ana López");
  });

  it("addWaitlistEntry registra al cliente aunque no tenga pedidos", async () => {
    const { result } = await renderLoadedStore();
    act(() => { result.current.addWaitlistEntry({ code: "M330", customerName: "María", qty: 4 }); });
    await waitFor(() => expect(result.current.customers).toHaveLength(1));
    expect(result.current.customers[0].name).toBe("María");
    expect(result.current.movements).toHaveLength(0);
  });

  it("deleteCustomer lo saca del registro sin tocar sus pedidos, y restoreCustomerData lo devuelve", async () => {
    const { result } = await renderLoadedStore();
    act(() => { result.current.confirmOrder(orderInput()); });
    await waitFor(() => expect(result.current.customers).toHaveLength(1));
    const snapshot = { movements: result.current.movements, customers: result.current.customers, waitlist: result.current.waitlist };

    act(() => { result.current.deleteCustomer("Ana"); });
    await waitFor(() => expect(result.current.customers).toHaveLength(0));
    expect(result.current.movements).toHaveLength(1);
    expect(savedState().customers).toEqual([]);

    act(() => { result.current.restoreCustomerData(snapshot); });
    await waitFor(() => expect(result.current.customers).toHaveLength(1));
    expect(savedState().customers[0].name).toBe("Ana");
  });

  it("la migración también registra a quienes solo están en la lista de espera", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      movements: [legacyMovement({ customerName: "Ana" })],
      waitlist: [
        { id: "w1", code: "M330", customerName: "María", qty: 3, createdAt: "2026-09-02T10:00:00.000Z" },
        { id: "w2", code: "M330", customerName: "Ana", qty: 1, createdAt: "2026-09-02T10:00:00.000Z" },
      ],
    }));
    const { result } = await renderLoadedStore();
    expect(result.current.customers.map((c) => c.name).sort()).toEqual(["Ana", "María"]);
  });

  it("datos guardados antes del registro se migran desde los pedidos, sin perder nada", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      movements: [
        legacyMovement({ id: "1", customerName: "Ana", businessName: "Cafetería", customerPhone: "5355551234" }),
        legacyMovement({ id: "2", orderId: "o2", customerName: "Beto", timestamp: "2026-09-02T10:00:00.000Z" }),
      ],
    }));
    const { result } = await renderLoadedStore();
    expect(result.current.customers.map((c) => c.name).sort()).toEqual(["Ana", "Beto"]);
    expect(result.current.customers.find((c) => c.name === "Ana")).toMatchObject({ businessName: "Cafetería", phone: "5355551234" });
    await waitFor(() => expect(savedState().customers).toHaveLength(2));
    expect(result.current.movements).toHaveLength(2);
  });
});

describe("protección de los datos guardados", () => {
  it("guarda la copia del estado anterior en el primer guardado del día", async () => {
    const original = JSON.stringify({ movements: [], stock: { P500: 7 } });
    localStorage.setItem(STORAGE_KEY, original);
    const { result } = await renderLoadedStore();
    await waitFor(() => expect(localStorage.getItem(PREV_KEY)).toBe(original));
    await waitFor(() => expect(result.current.autoCopyAt).not.toBeNull());
  });

  it("no pisa la copia ya tomada hoy en guardados siguientes", async () => {
    const original = JSON.stringify({ movements: [], stock: { P500: 7 } });
    localStorage.setItem(STORAGE_KEY, original);
    const { result } = await renderLoadedStore();
    await waitFor(() => expect(localStorage.getItem(PREV_KEY)).toBe(original));
    act(() => { result.current.confirmOrder(orderInput()); });
    await waitFor(() => expect(result.current.movements.length).toBe(1));
    expect(localStorage.getItem(PREV_KEY)).toBe(original);
  });

  it("datos ilegibles: no revienta, guarda una copia intacta y avisa", async () => {
    localStorage.setItem(STORAGE_KEY, "{esto no es json");
    const { result } = await renderLoadedStore();
    expect(result.current.loadProblem).toEqual({ hasPrev: false, prevAt: null });
    expect(localStorage.getItem(CORRUPT_KEY)).toBe("{esto no es json");
    expect(result.current.getCorruptCopy()).toBe("{esto no es json");
  });

  it("datos ilegibles: restaura la copia de ayer si existe", async () => {
    localStorage.setItem(PREV_KEY, JSON.stringify({ movements: [legacyMovement({ customerName: "Ana" })] }));
    localStorage.setItem(STORAGE_KEY, "{esto no es json");
    const { result } = await renderLoadedStore();
    expect(result.current.loadProblem.hasPrev).toBe(true);

    let ok;
    act(() => { ok = result.current.restorePreviousCopy(); });
    expect(ok).toBe(true);
    await waitFor(() => expect(result.current.movements).toHaveLength(1));
    expect(result.current.loadProblem).toBeNull();
    expect(result.current.customers[0].name).toBe("Ana");
    expect(savedState().movements).toHaveLength(1);
  });

  it("un guardado ilegible no borra la copia buena de ayer al volver a guardar", async () => {
    const good = JSON.stringify({ movements: [] });
    localStorage.setItem(PREV_KEY, good);
    localStorage.setItem(PREV_AT_KEY, "2020-01-01T00:00:00.000Z");
    localStorage.setItem(STORAGE_KEY, "{esto no es json");
    const { result } = await renderLoadedStore();
    act(() => { result.current.confirmOrder(orderInput()); });
    await waitFor(() => expect(result.current.movements.length).toBe(1));
    expect(localStorage.getItem(PREV_KEY)).toBe(good);
  });

  it("sin API de almacenamiento persistente avisa que no está garantizado", async () => {
    const { result } = await renderLoadedStore();
    await waitFor(() => expect(result.current.storageProtected).toBe(false));
  });
});

describe("recordatorio semanal de respaldo", () => {
  function storedWithBackup(daysAgo) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      lastBackupAt: new Date(Date.now() - daysAgo * 86400000).toISOString(),
      movements: [legacyMovement({})],
    }));
  }

  it("se activa a los 8 días del último respaldo", async () => {
    storedWithBackup(8);
    const { result } = await renderLoadedStore();
    expect(result.current.backupReminderDue).toBe(true);
  });

  it("no se activa a los 5 días", async () => {
    storedWithBackup(5);
    const { result } = await renderLoadedStore();
    expect(result.current.backupReminderDue).toBe(false);
  });
});
