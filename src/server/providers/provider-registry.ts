import { prisma } from "@/lib/prisma";
import { MockWhatsAppProvider } from "./mock-whatsapp-provider";
import type { WhatsAppProvider } from "./whatsapp-provider";

const mockProvider = new MockWhatsAppProvider();

/**
 * Resolves the currently active WhatsApp provider from the
 * ProviderCredential table, defaulting to the mock provider when none is
 * configured as active. All call sites should go through this registry
 * rather than importing MockWhatsAppProvider directly, so swapping in a
 * real provider later is a one-line config change.
 */
export async function getActiveProvider(): Promise<WhatsAppProvider> {
  const active = await prisma.providerCredential.findFirst({ where: { isActive: true } });

  if (!active || active.provider === "mock") {
    return mockProvider;
  }

  // Real providers (meta_whatsapp_cloud_api, telnyx) are implemented later —
  // see src/server/providers/whatsapp-provider.ts for the interface they
  // need to satisfy and README for the plug-in point.
  throw new Error(`No implementation registered for provider "${active.provider}"`);
}

export function getMockProvider(): MockWhatsAppProvider {
  return mockProvider;
}
