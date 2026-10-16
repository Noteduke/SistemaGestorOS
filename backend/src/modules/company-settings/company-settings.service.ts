import { BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma, type CompanySettings } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import type { CompanyLogoUpload } from "./company-settings.controller.js";
import type { CompanySettingsInput } from "./company-settings.dto.js";

const SINGLETON_ID = 1;
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const LOGO_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpg)$/iu;
const SETTINGS_SELECT = {
  id: true, legalName: true, tradeName: true, cnpj: true, fullAddress: true, phone: true, email: true,
  logoStorageKey: true, logoMime: true, updatedByUserId: true, updatedAt: true,
} as const;
type CompanySettingsRow = Pick<CompanySettings,
  "id" | "legalName" | "tradeName" | "cnpj" | "fullAddress" | "phone" | "email" | "logoStorageKey" | "logoMime" | "updatedByUserId" | "updatedAt"
>;

@Injectable()
export class CompanySettingsService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async get() {
    const settings = await this.prisma.companySettings.findUniqueOrThrow({ where: { id: SINGLETON_ID }, select: SETTINGS_SELECT });
    return { data: await this.toView(settings) };
  }

  async update(input: CompanySettingsInput, actor: AuthenticatedUser) {
    this.assertAdmin(actor);
    return this.prisma.$transaction(async (tx) => {
      const current = await lockSettings(tx);
      const updated = await tx.companySettings.update({ where: { id: SINGLETON_ID }, data: { ...input, updatedByUserId: actor.id }, select: SETTINGS_SELECT });
      const changes = changedValues(current, updated);
      if (Object.keys(changes).length) {
        await tx.adminAuditLog.create({ data: {
          eventCode: "COMPANY_SETTINGS_UPDATED", actorUserId: actor.id,
          detailsJson: { changedFields: changes } as Prisma.InputJsonValue,
        } });
      }
      return { data: await this.toView(updated) };
    }, { isolationLevel: "ReadCommitted", maxWait: 10000, timeout: 15000 });
  }

  async replaceLogo(file: CompanyLogoUpload | undefined, actor: AuthenticatedUser) {
    this.assertAdmin(actor);
    if (!file) throw new BadRequestException({ code: "COMPANY_LOGO_REQUIRED", message: "Selecione uma imagem PNG ou JPEG." });
    const mime = sniffImage(file.buffer);
    if (!mime || !["image/png", "image/jpeg"].includes(file.mimetype) || file.size !== file.buffer.length || file.size > MAX_LOGO_BYTES) {
      throw new BadRequestException({ code: "INVALID_COMPANY_LOGO", message: "A logo deve ser uma imagem PNG ou JPEG válida de até 2 MiB." });
    }
    const root = this.storageRoot();
    await mkdir(root, { recursive: true });
    const key = `${randomUUID()}${mime === "image/png" ? ".png" : ".jpg"}`;
    const filePath = path.join(root, key);
    await writeFile(filePath, file.buffer, { flag: "wx", mode: 0o600 });
    let previousKey: string | null = null;
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const current = await lockSettings(tx);
        previousKey = current.logoStorageKey;
        const row = await tx.companySettings.update({ where: { id: SINGLETON_ID }, data: { logoStorageKey: key, logoMime: mime, updatedByUserId: actor.id }, select: SETTINGS_SELECT });
        await tx.adminAuditLog.create({ data: {
          eventCode: "COMPANY_LOGO_REPLACED", actorUserId: actor.id,
          detailsJson: { previousLogoPresent: Boolean(current.logoStorageKey), newLogoPresent: true, mime } as Prisma.InputJsonValue,
        } });
        return row;
      }, { isolationLevel: "ReadCommitted", maxWait: 10000, timeout: 15000 });
      if (previousKey && LOGO_KEY.test(previousKey)) await rm(path.join(root, previousKey), { force: true }).catch(() => undefined);
      return { data: await this.toView(updated) };
    } catch (error) {
      await rm(filePath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async removeLogo(actor: AuthenticatedUser) {
    this.assertAdmin(actor);
    const root = this.storageRoot();
    const previousKey = await this.prisma.$transaction(async (tx) => {
      const current = await lockSettings(tx);
      if (!current.logoStorageKey) return null;
      await tx.companySettings.update({ where: { id: SINGLETON_ID }, data: { logoStorageKey: null, logoMime: null, updatedByUserId: actor.id } });
      await tx.adminAuditLog.create({ data: {
        eventCode: "COMPANY_LOGO_REMOVED", actorUserId: actor.id,
        detailsJson: { logoPresent: true } as Prisma.InputJsonValue,
      } });
      return current.logoStorageKey;
    }, { isolationLevel: "ReadCommitted", maxWait: 10000, timeout: 15000 });
    if (previousKey && LOGO_KEY.test(previousKey)) await rm(path.join(root, previousKey), { force: true }).catch(() => undefined);
    return this.get();
  }

  private async toView(settings: Pick<CompanySettings, "legalName" | "tradeName" | "cnpj" | "fullAddress" | "phone" | "email" | "logoStorageKey" | "logoMime" | "updatedAt">) {
    let logoDataUrl: string | null = null;
    let logoUnavailable = false;
    if (settings.logoStorageKey && settings.logoMime && LOGO_KEY.test(settings.logoStorageKey) && ["image/png", "image/jpeg"].includes(settings.logoMime)) {
      try {
        const contents = await readFile(path.join(this.storageRoot(), settings.logoStorageKey));
        const verifiedMime = sniffImage(contents);
        if (verifiedMime === settings.logoMime) logoDataUrl = `data:${verifiedMime};base64,${contents.toString("base64")}`;
        else logoUnavailable = true;
      } catch { logoUnavailable = true; }
    } else if (settings.logoStorageKey || settings.logoMime) logoUnavailable = true;
    return {
      legalName: settings.legalName,
      tradeName: settings.tradeName,
      cnpj: settings.cnpj,
      fullAddress: settings.fullAddress,
      phone: settings.phone,
      email: settings.email,
      logoDataUrl,
      logoMime: logoDataUrl ? settings.logoMime : null,
      logoUnavailable,
      deploymentEnvironment: this.deploymentEnvironment(),
      updatedAt: settings.updatedAt,
    };
  }

  private assertAdmin(actor: AuthenticatedUser) {
    if (!actor.isAdmin) throw new ForbiddenException({ code: "PERMISSION_DENIED", message: "Somente Administradores podem alterar os dados da empresa." });
  }

  private deploymentEnvironment(): "homologation" | "production" {
    return this.config.get<string>("GOS_DEPLOYMENT_ENV") === "homologation" ? "homologation" : "production";
  }

  private storageRoot(): string {
    const configuredRoot = this.config.get<string>("GOS_COMPANY_ASSETS_DIR")?.trim();
    if (!configuredRoot || !path.isAbsolute(configuredRoot)) {
      throw new ServiceUnavailableException({ code: "COMPANY_LOGO_STORAGE_UNAVAILABLE", message: "O armazenamento persistente de logos não está configurado." });
    }
    const root = path.resolve(configuredRoot, this.deploymentEnvironment());
    const publicRoots = [path.resolve(process.cwd(), "../frontend/public"), path.resolve(process.cwd(), "../frontend/dist"), path.resolve(process.cwd(), "frontend/public"), path.resolve(process.cwd(), "frontend/dist")];
    const screenshotRootValue = this.config.get<string>("GOS_HOMOLOGATION_FILES_DIR")?.trim();
    const protectedRoots = [...publicRoots, ...(screenshotRootValue && path.isAbsolute(screenshotRootValue) ? [path.resolve(screenshotRootValue)] : [])];
    if (protectedRoots.some((protectedRoot) => pathsOverlap(root, protectedRoot))) {
      throw new ServiceUnavailableException({ code: "COMPANY_LOGO_STORAGE_UNAVAILABLE", message: "O armazenamento de logos deve ficar fora de pastas públicas e separado das capturas de problemas." });
    }
    return root;
  }
}

async function lockSettings(tx: Prisma.TransactionClient): Promise<CompanySettingsRow> {
  await tx.$queryRaw`SELECT id FROM company_settings WHERE id = ${SINGLETON_ID} FOR UPDATE`;
  return tx.companySettings.findUniqueOrThrow({ where: { id: SINGLETON_ID }, select: SETTINGS_SELECT });
}

function changedValues(before: CompanySettingsRow, after: CompanySettingsRow): Record<string, { before: string | null; after: string | null }> {
  const result: Record<string, { before: string | null; after: string | null }> = {};
  for (const field of ["legalName", "tradeName", "cnpj", "fullAddress", "phone", "email"] as const) {
    if (before[field] !== after[field]) result[field] = { before: before[field], after: after[field] };
  }
  return result;
}

function pathsOverlap(left: string, right: string): boolean {
  const relativeLeft = path.relative(left, right);
  const relativeRight = path.relative(right, left);
  const inside = (relative: string) => relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  return inside(relativeLeft) || inside(relativeRight);
}

function sniffImage(buffer: Buffer): "image/png" | "image/jpeg" | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  return null;
}
