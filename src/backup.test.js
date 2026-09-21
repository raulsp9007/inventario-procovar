import { describe, it, expect, afterEach, vi } from "vitest";
import { shareFile, shareBackup, shareContactsFile, buildBackupFile } from "./backup";

const originalShare = navigator.share;
const originalCanShare = navigator.canShare;

function setShare(share, canShare) {
  Object.defineProperty(navigator, "share", { value: share, configurable: true, writable: true });
  Object.defineProperty(navigator, "canShare", { value: canShare, configurable: true, writable: true });
}

afterEach(() => {
  setShare(originalShare, originalCanShare);
  vi.restoreAllMocks();
});

function stubDownload() {
  URL.createObjectURL = vi.fn(() => "blob:fake");
  URL.revokeObjectURL = vi.fn();
  return vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
}

describe("shareFile", () => {
  const file = new File(["x"], "a.json", { type: "application/json" });

  it("unsupported si el navegador no tiene navigator.share", async () => {
    setShare(undefined, undefined);
    expect(await shareFile(file)).toBe("unsupported");
  });

  it("unsupported si canShare rechaza archivos", async () => {
    setShare(vi.fn(), vi.fn(() => false));
    expect(await shareFile(file)).toBe("unsupported");
  });

  it("shared si se compartió", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setShare(share, vi.fn(() => true));
    expect(await shareFile(file, { title: "t" })).toBe("shared");
    expect(share).toHaveBeenCalledWith({ files: [file], title: "t", text: undefined });
  });

  it("cancelled si el usuario cierra el menú (AbortError)", async () => {
    setShare(vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "AbortError" })), vi.fn(() => true));
    expect(await shareFile(file)).toBe("cancelled");
  });

  it("unsupported ante cualquier otro error al compartir", async () => {
    setShare(vi.fn().mockRejectedValue(new Error("boom")), vi.fn(() => true));
    expect(await shareFile(file)).toBe("unsupported");
  });
});

describe("shareBackup / shareContactsFile", () => {
  it("shareBackup comparte el JSON del estado cuando se puede", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setShare(share, vi.fn(() => true));
    expect(await shareBackup({ movements: [], customers: [{ name: "Ana" }] })).toBe("shared");
    const sent = share.mock.calls[0][0].files[0];
    expect(sent.name).toMatch(/^procovar-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(await sent.text()).customers[0].name).toBe("Ana");
  });

  it("shareBackup descarga el archivo si no se puede compartir", async () => {
    setShare(undefined, undefined);
    const click = stubDownload();
    expect(await shareBackup({ movements: [] })).toBe("downloaded");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("shareBackup no descarga nada si el usuario cancela", async () => {
    setShare(vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "AbortError" })), vi.fn(() => true));
    const click = stubDownload();
    expect(await shareBackup({ movements: [] })).toBe("cancelled");
    expect(click).not.toHaveBeenCalled();
  });

  it("shareContactsFile manda un .vcf y cae a descarga si no se puede", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setShare(share, vi.fn(() => true));
    expect(await shareContactsFile("BEGIN:VCARD\r\nEND:VCARD\r\n")).toBe("shared");
    expect(share.mock.calls[0][0].files[0].name).toMatch(/^procovar-clientes-\d{4}-\d{2}-\d{2}\.vcf$/);

    setShare(undefined, undefined);
    const click = stubDownload();
    expect(await shareContactsFile("BEGIN:VCARD\r\nEND:VCARD\r\n")).toBe("downloaded");
    expect(click).toHaveBeenCalledTimes(1);
  });
});

describe("buildBackupFile", () => {
  it("serializa el estado completo como JSON legible", async () => {
    const file = buildBackupFile({ a: 1 });
    expect(file.type).toBe("application/json");
    expect(JSON.parse(await file.text())).toEqual({ a: 1 });
  });
});
