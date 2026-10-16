import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Req, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { RequireAuthenticated } from "../auth/decorators/auth-metadata.js";
import type { AuthRequest } from "../auth/auth.types.js";
import { HomologationIssuesService } from "./homologation-issues.service.js";

@Controller("homologation/issues")
@RequireAuthenticated()
export class HomologationIssuesController {
  constructor(private readonly issues: HomologationIssuesService) {}
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor("screenshot", { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5, fieldSize: 6000, parts: 6 }, fileFilter: (_req, file, callback) => ["image/png", "image/jpeg"].includes(file.mimetype) ? callback(null, true) : callback(new BadRequestException({ code: "INVALID_SCREENSHOT", message: "Envie uma captura PNG ou JPEG." }), false) }))
  create(@Body() body: Record<string, unknown>, @UploadedFile() file: UploadFile | undefined, @Req() request: AuthRequest) {
    return this.issues.create(body, file, request.auth!);
  }
  @Get()
  list(@Req() request: AuthRequest) { return this.issues.list(request.auth!); }
  @Patch(":publicId/status")
  updateStatus(@Param("publicId") publicId: string, @Body() body: unknown, @Req() request: AuthRequest) { return this.issues.updateStatus(publicId, body, request.auth!); }
  @Get(":publicId/screenshot")
  async screenshot(@Param("publicId") publicId: string, @Req() request: AuthRequest, @Res() response: Response) {
    const result = await this.issues.readScreenshot(publicId, request.auth!);
    response.setHeader("Content-Type", result.mime);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Disposition", "attachment; filename=homologation-issue-screenshot");
    response.send(result.data);
  }
}
export interface UploadFile { buffer: Buffer; mimetype: string; size: number }
