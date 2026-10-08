import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthPolicyService } from "./auth-policy.service.js";
import { AuthService } from "./auth.service.js";
import { CsrfGuard } from "./guards/csrf.guard.js";
import { PermissionGuard } from "./guards/permission.guard.js";
import { SessionAuthGuard } from "./guards/session-auth.guard.js";

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthPolicyService,
    SessionAuthGuard,
    CsrfGuard,
    PermissionGuard,
    { provide: APP_GUARD, useExisting: SessionAuthGuard },
    { provide: APP_GUARD, useExisting: CsrfGuard },
    { provide: APP_GUARD, useExisting: PermissionGuard },
  ],
  exports: [AuthService, AuthPolicyService],
})
export class AuthModule {}
