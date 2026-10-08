import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from "@nestjs/common";
import type { Response } from "express";
import { AuthService } from "./auth.service.js";
import type { AuthRequest } from "./auth.types.js";
import { Public, RequireAuthenticated, RequirePreAuthCsrf } from "./decorators/auth-metadata.js";
import { parseLoginInput } from "./dto/auth.dto.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get("csrf")
  @Public()
  createCsrfContext(@Req() request: AuthRequest, @Res({ passthrough: true }) response: Response) {
    return this.auth.createPreAuthCsrf(request, response);
  }

  @Post("login")
  @Public()
  @RequirePreAuthCsrf()
  login(
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.login(parseLoginInput(body), request, response, request.preAuthCsrfContextId);
  }

  @Post("logout")
  @RequireAuthenticated()
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(request.auth!, response, request);
  }

  @Get("me")
  @RequireAuthenticated()
  me(@Req() request: AuthRequest) {
    return this.auth.currentIdentity(request.auth!, request);
  }
}
