import assert from "node:assert/strict";
import test from "node:test";
import { parseCancelServiceOrder, parseCloseServiceOrder } from "../dist/modules/service-orders/dto/service-order-closure.dto.js";
import { sanitizeServiceOrderEventPayload } from "../dist/modules/service-orders/service-order-events-read.service.js";

const itemPublicId = "6a5ccbc1-a7cc-4a12-8f71-65b9f379d910";
const productPublicId = "a542fc64-f29a-4ba1-859e-0af1462d8435";

test("valida os dois resultados de fechamento e restringe campos por operação", () => {
  assert.deepEqual(parseCloseServiceOrder({ outcome: "REPAIRED" }), { outcome: "REPAIRED", confirmPhysicalRemoval: false, defectiveItems: [] });
  assert.deepEqual(parseCloseServiceOrder({ outcome: "WITHOUT_REPAIR", confirmPhysicalRemoval: true, defectiveItems: [{ itemPublicId, quantity: 1 }] }), {
    outcome: "WITHOUT_REPAIR", confirmPhysicalRemoval: true, defectiveItems: [{ itemPublicId, quantity: 1 }],
  });
  assert.throws(() => parseCloseServiceOrder({ outcome: "REPAIRED", confirmPhysicalRemoval: true }), { status: 400 });
  assert.throws(() => parseCloseServiceOrder({ outcome: "WITHOUT_REPAIR", defectiveItems: [{ itemPublicId, quantity: 1 }, { itemPublicId, quantity: 2 }] }), { status: 400 });
  assert.throws(() => parseCloseServiceOrder({ outcome: "WITHOUT_REPAIR", defectiveItems: [{ itemPublicId, quantity: 0 }] }), { status: 400 });
  assert.deepEqual(parseCancelServiceOrder({ confirmPhysicalRemoval: true, defectiveItems: [] }), { confirmPhysicalRemoval: true, defectiveItems: [] });
  assert.throws(() => parseCancelServiceOrder({ outcome: "REPAIRED" }), { status: 400 });
});

test("a projeção do histórico de fechamento filtra campos desconhecidos e não expõe custos", () => {
  const payload = sanitizeServiceOrderEventPayload("OS_ENCERRADA", {
    previousMacroStatus: "ABERTA", newMacroStatus: "FECHADA", outcome: "REPAIRED", secret: "drop",
    stockOperations: [{ itemPublicId, productPublicId, description: "Peça", quantity: 2, operation: "CONSUMED", unitCostSnapshot: "999.00" }],
  });
  assert.deepEqual(payload, {
    previousMacroStatus: "ABERTA", newMacroStatus: "FECHADA", outcome: "REPAIRED",
    stockOperations: [{ itemPublicId, productPublicId, description: "Peça", quantity: 2, operation: "CONSUMED" }],
  });
});
