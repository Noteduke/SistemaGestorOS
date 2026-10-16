import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Put, Req, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { RequireAuthenticated } from "../auth/decorators/auth-metadata.js";
import type { AuthRequest } from "../auth/auth.types.js";
import { parseCompanySettingsInput } from "./company-settings.dto.js";
import { CompanySettingsService } from "./company-settings.service.js";

@Controller("company-settings")
@RequireAuthenticated()
export class CompanySettingsController {
  constructor(private readonly settings: CompanySettingsService) {}

  @Get()
  get() { return this.settings.get(); }

  @Patch()
  update(@Body() body: unknown, @Req() request: AuthRequest) {
    return this.settings.update(parseCompanySettingsInput(body), request.auth!);
  }

  @Put("logo")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor("logo", {
    limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
    fileFilter: (_request, file, callback) => ["image/png", "image/jpeg"].includes(file.mimetype)
      ? callback(null, true)
      : callback(new BadRequestException({ code: "INVALID_COMPANY_LOGO", message: "Envie uma imagem PNG ou JPEG." }), false),
  }))
  uploadLogo(@UploadedFile() file: CompanyLogoUpload | undefined, @Req() request: AuthRequest) {
    return this.settings.replaceLogo(file, request.auth!);
  }

  @Delete("logo")
  @HttpCode(HttpStatus.OK)
  removeLogo(@Req() request: AuthRequest) { return this.settings.removeLogo(request.auth!); }
}

export interface CompanyLogoUpload { buffer: Buffer; mimetype: string; size: number }
