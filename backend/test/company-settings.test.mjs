import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { parseCompanySettingsInput } from "../dist/modules/company-settings/company-settings.dto.js";
import { CompanySettingsService } from "../dist/modules/company-settings/company-settings.service.js";
import { formatServiceOrderNumber } from "../dist/modules/service-orders/domain/service-order-number-format.js";

const admin = { id: 7, publicId: "10000000-0000-4000-8000-000000000007", isAdmin: true };
const employee = { ...admin, isAdmin: false };

function companyRow() {
  return { id: 1, legalName: null, tradeName: null, cnpj: null, fullAddress: null, phone: null, email: null,
    logoStorageKey: null, logoMime: null, updatedByUserId: null, createdAt: new Date(), updatedAt: new Date() };
}

function settingsHarness(configValues = {}, row = companyRow()) {
  const audit = [];
  const tx = {
    async $queryRaw() { return [{ id: 1 }]; },
    companySettings: {
      async findUniqueOrThrow() { return { ...row }; },
      async update({ data }) { Object.assign(row, data, { updatedAt: new Date() }); return { ...row }; },
    },
    adminAuditLog: { async create({ data }) { audit.push(data); } },
  };
  const prisma = { async $transaction(callback) { return callback(tx); }, companySettings: { async findUniqueOrThrow() { return { ...row }; } } };
  const config = { get(name) { return configValues[name]; } };
  return { service: new CompanySettingsService(prisma, config), row, audit };
}

test("normaliza campos e preserva CNPJ vazio distinto de valor informado", () => {
  assert.deepEqual(parseCompanySettingsInput({ legalName: "  Empresa   Oficial ", cnpj: "11.222.333/0001-81", email: "INFO@EXAMPLE.COM" }), {
    legalName: "Empresa Oficial", cnpj: "11222333000181", email: "info@example.com",
  });
  assert.deepEqual(parseCompanySettingsInput({ cnpj: "" }), { cnpj: null });
  assert.throws(() => parseCompanySettingsInput({ cnpj: "00.000.000/0000-00" }), (error) => error.response.code === "INVALID_COMPANY_CNPJ");
  assert.throws(() => parseCompanySettingsInput({ internalId: 1 }), (error) => error.response.code === "INVALID_COMPANY_SETTINGS");
});

test("somente Administrador pode alterar a identificação da empresa", async () => {
  const { service } = settingsHarness();
  await assert.rejects(service.update({ legalName: "EMPRESA" }, employee), ForbiddenException);
  await assert.rejects(service.replaceLogo({ buffer: Buffer.alloc(0), size: 0, mimetype: "image/png" }, employee), ForbiddenException);
  await assert.rejects(service.removeLogo(employee), ForbiddenException);
  assert.equal((await service.get()).data.legalName, null);
});

test("registra mudanças administrativas e logo validada em diretório próprio de homologação", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "gos-company-settings-"));
  try {
    const { service, row, audit } = settingsHarness({
      GOS_COMPANY_ASSETS_DIR: directory,
      GOS_DEPLOYMENT_ENV: "homologation",
      GOS_HOMOLOGATION_FILES_DIR: path.join(directory, "screenshots"),
    });
    const updated = await service.update({ tradeName: "MARCA CADASTRADA" }, admin);
    assert.equal(updated.data.tradeName, "MARCA CADASTRADA");
    assert.equal(audit[0].eventCode, "COMPANY_SETTINGS_UPDATED");
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    const withLogo = await service.replaceLogo({ buffer: png, size: png.length, mimetype: "image/png" }, admin);
    assert.match(withLogo.data.logoDataUrl, /^data:image\/png;base64,/u);
    assert.equal(withLogo.data.deploymentEnvironment, "homologation");
    assert.equal(row.logoMime, "image/png");
    assert.equal(audit[1].eventCode, "COMPANY_LOGO_REPLACED");
    assert.equal((await readdir(path.join(directory, "homologation"))).length, 1);
    const firstLogoKey = row.logoStorageKey;
    const replacementPng = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
    await service.replaceLogo({ buffer: replacementPng, size: replacementPng.length, mimetype: "image/png" }, admin);
    assert.notEqual(row.logoStorageKey, firstLogoKey);
    assert.equal((await readdir(path.join(directory, "homologation"))).length, 1, "a logo anterior deve ser removida após a substituição");
    assert.equal(audit[2].eventCode, "COMPANY_LOGO_REPLACED");
    const invalidImage = Buffer.from("not an image");
    await assert.rejects(service.replaceLogo({ buffer: invalidImage, size: invalidImage.length, mimetype: "image/png" }, admin),
      (error) => error.response.code === "INVALID_COMPANY_LOGO");
    const removed = await service.removeLogo(admin);
    assert.equal(removed.data.logoDataUrl, null);
    assert.equal(audit.at(-1).eventCode, "COMPANY_LOGO_REMOVED");
    assert.deepEqual(await readdir(path.join(directory, "homologation")), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("o número da homologação tem prefixo e largura próprios sem mudar produção", () => {
  assert.equal(formatServiceOrderNumber(1n, "homologation"), "HOS-0000001");
  assert.equal(formatServiceOrderNumber(42n, "homologation"), "HOS-0000042");
  assert.equal(formatServiceOrderNumber(10000000n, "homologation"), "HOS-10000000");
  assert.equal(formatServiceOrderNumber(1n, "production"), "OS-000001");
});
