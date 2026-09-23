import { auth } from "./auth";
import { withOrganization } from "./organization-context";
/** Authentication refreshes workspace membership in the database on every request. */
export function organizationRequest<A extends unknown[], R>(handler: (...args: A) => Promise<R>) {
  return async (...args: A): Promise<R> => {
    const session = await auth();
    // Existing handlers retain their unauthorized response/redirect. Any DB use fails closed.
    if (!session?.user?.organizationId) return handler(...args);
    return withOrganization(session.user.organizationId, () => handler(...args), session);
  };
}
