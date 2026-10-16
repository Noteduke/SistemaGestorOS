import assert from "node:assert/strict";
import test from "node:test";
import { safeDiagnosticMessage } from "../dist/infrastructure/safe-diagnostic.js";

test("diagnósticos removem credenciais e senhas de mensagens de erro", () => {
  const message = safeDiagnosticMessage(
    new Error("connect failed mysql://gestor:secret-value@localhost:3306/gestor_os?password=other-secret"),
    "Falha genérica.",
  );
  assert.equal(message.includes("secret-value"), false);
  assert.equal(message.includes("other-secret"), false);
  assert.equal(message.includes("mysql://gestor:"), false);
  assert.match(message, /\[URL do banco redigida\]/u);
  assert.match(safeDiagnosticMessage(new Error("password=other-secret"), "Fallback."), /password=\[REDACTED\]/u);
});

test("diagnósticos preservam mensagens não sensíveis", () => {
  assert.equal(safeDiagnosticMessage(new Error("Banco esperado não selecionado."), "Fallback."), "Banco esperado não selecionado.");
  assert.equal(safeDiagnosticMessage("unexpected", "Falha genérica."), "Falha genérica.");
});
