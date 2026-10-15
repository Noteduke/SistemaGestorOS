import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "auth:is-public";
export const AUTHENTICATED_ONLY_KEY = "auth:authenticated-only";
export const REQUIRED_PERMISSIONS_KEY = "auth:required-permissions";
export const ANY_REQUIRED_PERMISSIONS_KEY = "auth:any-required-permissions";
export const PRE_AUTH_CSRF_KEY = "auth:pre-auth-csrf";

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const RequireAuthenticated = () => SetMetadata(AUTHENTICATED_ONLY_KEY, true);
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
export const RequireAnyPermissions = (...permissions: string[]) =>
  SetMetadata(ANY_REQUIRED_PERMISSIONS_KEY, permissions);
export const RequirePreAuthCsrf = () => SetMetadata(PRE_AUTH_CSRF_KEY, true);
