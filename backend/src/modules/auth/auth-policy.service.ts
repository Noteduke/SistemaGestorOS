import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import type { AuthenticatedUser } from "./auth.types.js";

@Injectable()
export class AuthPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async assertAllowed(user: AuthenticatedUser, requiredPermissions: string[]): Promise<void> {
    if (requiredPermissions.length === 0) {
      throw new ForbiddenException({ code: "AUTHORIZATION_POLICY_MISSING", message: "A rota protegida não declarou política de autorização." });
    }
    if (user.isAdmin) return;

    const grants = await this.prisma.userPermission.findMany({
      where: {
        userId: user.id,
        permission: { code: { in: requiredPermissions } },
      },
      select: { permission: { select: { code: true } } },
    });
    const granted = new Set(grants.map(({ permission }) => permission.code));
    if (!requiredPermissions.every((permission) => granted.has(permission))) {
      throw new ForbiddenException({ code: "PERMISSION_DENIED", message: "Você não tem permissão para esta operação." });
    }
  }

  async effectivePermissions(user: Pick<AuthenticatedUser, "id" | "isAdmin">): Promise<string[]> {
    if (user.isAdmin) {
      const permissions = await this.prisma.permission.findMany({ select: { code: true }, orderBy: { code: "asc" } });
      return permissions.map(({ code }) => code);
    }
    const grants = await this.prisma.userPermission.findMany({
      where: { userId: user.id },
      select: { permission: { select: { code: true } } },
      orderBy: { permission: { code: "asc" } },
    });
    return grants.map(({ permission }) => permission.code);
  }
}
