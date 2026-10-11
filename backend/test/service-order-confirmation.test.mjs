import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { parseConfirmOpening } from "../dist/modules/service-orders/dto/confirm-opening.dto.js";

const id = "d0ac1a1e-347a-4aba-9541-74f87e67ac16";

test("confirmação aceita corpo vazio e campos permitidos", () => {
  assert.deepEqual(parseConfirmOpening(undefined), {});
  assert.deepEqual(parseConfirmOpening({}), {});
  assert.deepEqual(parseConfirmOpening({ intakeObservations: "Entrada", assignedUserPublicIds: [id] }), {
    intakeObservations: "ENTRADA", assignedUserPublicIds: [id],
  });
});

test("confirmação rejeita campos que pertencem ao servidor ou à abertura", () => {
  for (const body of [{ numberValue: "1" }, { customerPublicId: id }, { equipmentDraft: {} }, { macroStatus: "OPEN" }, { actorUserId: 1 }]) {
    assert.throws(() => parseConfirmOpening(body));
  }
});

test("atribuições exigem publicIds distintos e válidos", () => {
  for (const ids of [[id, id], ["invalid"], [1], null]) {
    assert.throws(() => parseConfirmOpening({ assignedUserPublicIds: ids }));
  }
  assert.deepEqual(parseConfirmOpening({ assignedUserPublicIds: [] }), { assignedUserPublicIds: [] });
});

test("observações respeitam a capacidade em bytes do TEXT após normalização", () => {
  assert.throws(() => parseConfirmOpening({ intakeObservations: "é".repeat(40000) }));
});
