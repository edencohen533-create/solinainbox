import "@testing-library/jest-dom/vitest";

// Route unit tests mock auth and persistence; organization/RLS behavior is verified
// separately with real PostgreSQL and in organization-boundary.test.ts.
import { vi } from "vitest";
vi.mock("@/lib/organization-request", () => ({ organizationRequest: (handler: unknown) => handler }));

vi.mock("@/lib/organization-context", async (importOriginal) => ({ ...(await importOriginal<object>()), requireOrganizationId: () => "legacy" }));
