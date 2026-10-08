import { ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { IS_PUBLIC_KEY, AUTHENTICATED_ONLY_KEY, REQUIRED_PERMISSIONS_KEY } from "../decorators/auth-metadata.js";
import { AuthPolicyService } from "../auth-policy.service.js";
import type { AuthRequest } from "../auth.types.js";

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly policy: AuthPolicyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(AUTHENTICATED_ONLY_KEY, targets)) return true;

    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, targets);
    if (!required || required.length === 0) {
      throw new ForbiddenException({ code: "AUTHORIZATION_POLICY_MISSING", message: "A rota protegida não declarou política de autorização." });
    }
    const request = context.switchToHttp().getRequest<AuthRequest>();
    if (!request.auth) {
      throw new ForbiddenException({ code: "AUTHORIZATION_POLICY_MISSING", message: "A rota protegida não possui identidade autenticada." });
    }
    await this.policy.assertAllowed(request.auth, required);
    return true;
  }
}
