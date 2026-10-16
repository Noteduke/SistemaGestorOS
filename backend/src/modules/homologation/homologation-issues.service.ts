import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma, type HomologationIssueStatus } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import type { UploadFile } from "./homologation-issues.controller.js";

const MAX_PAGE = 100;
const statusMap = { PENDING: "PENDENTE", IN_PROGRESS: "EM CORREÇÃO", FIXED: "CORRIGIDO", VALIDATED: "VALIDADO" } as const;
const allowedStatuses = Object.keys(statusMap) as HomologationIssueStatus[];
@Injectable()
export class HomologationIssuesService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}
  async create(body: Record<string, unknown>, file: UploadFile | undefined, actor: AuthenticatedUser) {
    this.assertHomologation();
    const description = requiredText(body.description, 5000);
    const attemptedAction = requiredText(body.attemptedAction, 2000);
    const observedResult = requiredText(body.observedResult, 5000);
    const screenReference = optionalText(body.screenReference, 191);
    const orderPublicId = optionalText(body.serviceOrderPublicId, 36);
    const order = orderPublicId ? await this.prisma.serviceOrder.findUnique({ where: { publicId: orderPublicId }, select: { id: true } }) : null;
    if (orderPublicId && !order) throw new BadRequestException({ code: "INVALID_SERVICE_ORDER", message: "A OS informada não foi encontrada." });
    const storage = file ? await this.storeScreenshot(file) : null;
    try {
      const issue = await this.prisma.homologationIssue.create({ data: {
        description, attemptedAction, observedResult, screenReference, serviceOrderId: order?.id,
        screenshotStorageKey: storage?.key, screenshotMime: storage?.mime,
        systemVersion: this.config.get<string>("GOS_SYSTEM_VERSION") ?? this.config.get<string>("npm_package_version") ?? "0.1.0",
        reportedByUserId: actor.id,
      }, select: { publicId: true, status: true, systemVersion: true, createdAt: true } });
      return { data: { ...issue, status: statusMap[issue.status] } };
    } catch (error) {
      if (storage) await rm(storage.path, { force: true }).catch(() => undefined);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") throw new BadRequestException({ code: "INVALID_SERVICE_ORDER", message: "Não foi possível vincular a OS informada." });
      throw error;
    }
  }
  async list(actor: AuthenticatedUser) {
    this.assertHomologation(); this.assertAdmin(actor);
    const rows = await this.prisma.homologationIssue.findMany({ take: MAX_PAGE, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { publicId: true, description: true, attemptedAction: true, observedResult: true, screenReference: true, systemVersion: true, status: true, createdAt: true, updatedAt: true, screenshotMime: true, serviceOrder: { select: { numberValue: true } }, reportedBy: { select: { username: true } }, updatedBy: { select: { username: true } } } });
    return { data: rows.map(({ status, serviceOrder, ...row }) => ({ ...row, serviceOrderNumber: serviceOrder?.numberValue.toString() ?? null, status: statusMap[status] })) };
  }
  async updateStatus(publicId: string, body: unknown, actor: AuthenticatedUser) {
    this.assertHomologation(); this.assertAdmin(actor);
    const value = typeof body === "object" && body !== null && "status" in body ? (body as { status?: unknown }).status : undefined;
    const status = allowedStatuses.find((candidate) => value === statusMap[candidate]);
    if (!status) throw new BadRequestException({ code: "INVALID_ISSUE_STATUS", message: "Situação inválida." });
    try {
      const issue = await this.prisma.homologationIssue.update({ where: { publicId }, data: { status, updatedByUserId: actor.id }, select: { publicId: true, status: true, updatedAt: true } });
      return { data: { ...issue, status: statusMap[issue.status] } };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") throw new NotFoundException({ code: "ISSUE_NOT_FOUND", message: "Registro de problema não encontrado." });
      throw error;
    }
  }
  async readScreenshot(publicId: string, actor: AuthenticatedUser) {
    this.assertHomologation(); this.assertAdmin(actor);
    const issue = await this.prisma.homologationIssue.findUnique({ where: { publicId }, select: { screenshotStorageKey: true, screenshotMime: true } });
    if (!issue) throw new NotFoundException({ code: "ISSUE_NOT_FOUND", message: "Registro de problema não encontrado." });
    if (!issue.screenshotStorageKey || !issue.screenshotMime) throw new NotFoundException({ code: "ISSUE_SCREENSHOT_NOT_FOUND", message: "Este registro não possui captura de tela." });
    if (!/^[0-9a-f-]{36}\.(?:png|jpg)$/iu.test(issue.screenshotStorageKey)) throw new NotFoundException({ code: "ISSUE_SCREENSHOT_NOT_FOUND", message: "A captura de tela não está disponível." });
    try { return { data: await readFile(path.join(this.storageRoot(), issue.screenshotStorageKey)), mime: issue.screenshotMime }; }
    catch { throw new NotFoundException({ code: "ISSUE_SCREENSHOT_NOT_FOUND", message: "A captura de tela não está disponível." }); }
  }
  private assertHomologation() { if (this.config.get<string>("GOS_DEPLOYMENT_ENV") !== "homologation") throw new NotFoundException(); }
  private assertAdmin(actor: AuthenticatedUser) { if (!actor.isAdmin) throw new ForbiddenException({ code: "PERMISSION_DENIED", message: "Somente Administradores podem consultar e atualizar os problemas reportados." }); }
  private storageRoot() {
    const value = this.config.get<string>("GOS_HOMOLOGATION_FILES_DIR")?.trim();
    if (!value || !path.isAbsolute(value)) throw new ServiceUnavailableException({ code: "HOMOLOGATION_FILE_STORAGE_UNAVAILABLE", message: "O armazenamento isolado de homologação não está configurado." });
    const root = path.resolve(value);
    const publicRoots = [path.resolve(process.cwd(), "../frontend/public"), path.resolve(process.cwd(), "../frontend/dist"), path.resolve(process.cwd(), "frontend/public"), path.resolve(process.cwd(), "frontend/dist")];
    if (publicRoots.some((publicRoot) => { const relative = path.relative(publicRoot, root); return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)); })) {
      throw new ServiceUnavailableException({ code: "HOMOLOGATION_FILE_STORAGE_UNAVAILABLE", message: "O armazenamento de capturas não pode ficar em uma pasta pública." });
    }
    return root;
  }
  private async storeScreenshot(file: UploadFile) {
    const mime = sniffImage(file.buffer);
    if (!mime || !["image/png", "image/jpeg"].includes(file.mimetype) || file.size !== file.buffer.length || file.size > 5 * 1024 * 1024) throw new BadRequestException({ code: "INVALID_SCREENSHOT", message: "Envie uma captura PNG ou JPEG de até 5 MiB." });
    const root = this.storageRoot(); await mkdir(root, { recursive: true });
    const key = `${randomUUID()}${mime === "image/png" ? ".png" : ".jpg"}`; const filePath = path.join(root, key);
    await writeFile(filePath, file.buffer, { flag: "wx", mode: 0o600 });
    return { key, mime, path: filePath };
  }
}
function requiredText(value: unknown, max: number) { if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new BadRequestException({ code: "INVALID_ISSUE_INPUT", message: "Campo obrigatório ausente ou acima do limite." }); return value.trim(); }
function optionalText(value: unknown, max: number): string | null { if (value === undefined || value === null || value === "") return null; if (typeof value !== "string" || value.trim().length > max) throw new BadRequestException({ code: "INVALID_ISSUE_INPUT", message: "Campo opcional inválido." }); return value.trim() || null; }
function sniffImage(buffer: Buffer): "image/png" | "image/jpeg" | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  return null;
}
