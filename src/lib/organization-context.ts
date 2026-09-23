import { AsyncLocalStorage } from "node:async_hooks";
import type { Session } from "next-auth";
const context = new AsyncLocalStorage<{ organizationId: string; session?: Session }>();
export function requireOrganizationId(): string {
  const id = context.getStore()?.organizationId;
  if (!id) throw new Error("Organization context is required");
  return id;
}
export function organizationSession() { return context.getStore()?.session; }
/** Only trusted entry points may establish scope; never use a request-supplied tenant ID. */
export function withOrganization<T>(organizationId: string, operation: () => T, session?: Session): T {
  if (!organizationId) throw new Error("Organization context is required");
  return context.run({ organizationId, session }, operation);
}
