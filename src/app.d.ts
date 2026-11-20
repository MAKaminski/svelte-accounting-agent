import type { Identity, Role } from '$lib/server/identity';
declare global {
  namespace App {
    interface Locals {
      /** Signed-in email (or owner@local in dev bypass). */
      user: string | null;
      identity: Identity | null;
      orgId?: string;
      role: Role | null;
    }
  }
}
export {};
