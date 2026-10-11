import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { App } from "./App";

const order = {
  publicId: "6a5ccbc1-a7cc-4a12-8f71-65b9f379d910",
  openingPublicId: "a542fc64-f29a-4ba1-859e-0af1462d8435",
  visibleNumber: "OS-000128",
  numberValue: "128",
  macroStatus: "ABERTA",
  operationalSituation: "TRIAGEM",
  customer: { publicId: "d7d60964-4c5d-4d4e-9362-c56c2c08b4cf", name: "Marina Costa" },
  equipment: { publicId: "a23a7f29-8a4c-4704-9ce4-593c3ba013a0", type: "Notebook", brand: "Lenovo", model: "ThinkPad", serialNumber: "SN-45", ownerPublicId: "d7d60964-4c5d-4d4e-9362-c56c2c08b4cf" },
  openedAt: "2026-10-10T13:00:00.000Z",
  createdAt: "2026-10-10T13:00:00.000Z",
  updatedAt: "2026-10-10T13:00:00.000Z",
  confirmedAt: "2026-10-10T13:00:00.000Z",
  complaint: null,
  intakeObservations: null,
  newEquipmentSerialIdentificationStatus: null,
  createdByUserPublicId: "8d02a98e-1d95-4f86-a5a3-dbd4f234a0cd",
  assignedUserPublicIds: [],
  snapshotVersion: 1,
  snapshotCapturedAt: "2026-10-10T13:00:00.000Z",
  customerSnapshotJson: { snapshotVersion: 1, capturedAt: "2026-10-10T13:00:00.000Z", name: "Marina Costa" },
  equipmentSnapshotJson: { snapshotVersion: 1, capturedAt: "2026-10-10T13:00:00.000Z", model: "ThinkPad" },
};

function response(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

it("navega da listagem para o detalhe sem chamar endpoints mutáveis", async () => {
  window.location.hash = "#/service-orders";
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(response({ data: [order], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }))
    .mockResolvedValueOnce(response({ data: order }));
  vi.stubGlobal("fetch", fetchMock);
  render(<App />);

  expect(await screen.findByText("OS-000128")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Ver detalhes/ }));
  expect(await screen.findByRole("heading", { name: "OS-000128" })).toBeInTheDocument();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(fetchMock.mock.calls.every(([, options]) => options.method === "GET")).toBe(true);
});
