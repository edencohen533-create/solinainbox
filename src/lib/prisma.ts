import type { Prisma } from "@prisma/client";
import { systemDatabase } from "./system-database";
import { requireOrganizationId } from "./organization-context";

/** Each operation gets a short RLS transaction. Never hold one across provider I/O:
 * QUEUED must commit before a send can escape the process. SET LOCAL resets on pool reuse. */
type TransactionOptions = { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel };
type OrganizationDatabase = Prisma.TransactionClient & {
  $transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, options?: TransactionOptions): Promise<T>;
};
async function scoped<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, options?: TransactionOptions): Promise<T> {
  const organizationId = requireOrganizationId();
  // PgBouncer can reuse a server connection with a different search_path. Prisma's
  // model queries qualify tables, but handwritten lock queries do not.
  const schema = new URL(process.env.DATABASE_URL!).searchParams.get("schema") ?? "public";
  const searchPath = `"${schema.replaceAll('"', '""')}"`;
  return systemDatabase.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('role', 'solina_runtime', true), set_config('solina.organization_id', ${organizationId}, true), set_config('search_path', ${searchPath}, true)`;
    return operation(tx);
  }, options);
}

const delegates = new Map<string, object>();
export const prisma = new Proxy({} as OrganizationDatabase, {
  get(_target, property) {
    if (typeof property !== "string") return undefined;
    if (property === "$transaction") return (operation: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: Parameters<typeof scoped>[1]) => {
      if (typeof operation !== "function") throw new Error("Use an interactive organization transaction");
      return scoped(operation, options);
    };
    if (["$queryRaw", "$executeRaw", "$queryRawUnsafe", "$executeRawUnsafe"].includes(property)) {
      return (...args: unknown[]) => scoped(async (tx) => Reflect.apply(Reflect.get(tx, property), tx, args));
    }
    if (property.startsWith("$") || property.startsWith("_") || property === "then") return undefined;
    if (!delegates.has(property)) delegates.set(property, new Proxy({}, {
      get(_delegate, method) {
        return (...args: unknown[]) => scoped(async (tx) => {
          const delegate = Reflect.get(tx, property);
          return Reflect.apply(Reflect.get(delegate, method), delegate, args);
        });
      },
    }));
    return delegates.get(property);
  },
});
