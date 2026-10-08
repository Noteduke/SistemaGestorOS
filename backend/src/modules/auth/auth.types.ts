import type { Request } from "express";

export interface AuthenticatedUser {
  id: number;
  publicId: string;
  username: string;
  isAdmin: boolean;
  sessionId: number;
  sessionExpiresAt: Date;
  sessionCsrfTokenHash: string;
}

export type AuthRequest = Request & {
  auth?: AuthenticatedUser;
  preAuthCsrfContextId?: number;
};
