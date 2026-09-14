import { prisma } from "@/lib/prisma";
import { MockWhatsAppProvider } from "./mock-whatsapp-provider";
import { MetaWhatsAppProvider, type MetaWhatsAppConfig } from "./meta-whatsapp-provider";
import type { WhatsAppProvider } from "./whatsapp-provider";

const mockProvider = new MockWhatsAppProvider();

/**
 * Resolves the currently active WhatsApp provider from the
 * ProviderCredential table, defaulting to the mock provider when none is
 * configured as active. All call sites should go through this registry
 * rather than importing a concrete provider directly, so swapping providers
 * is a config change, not a code change.
 */
export async function getActiveProvider(): Promise<WhatsAppProvider> {
  const active = await prisma.providerCredential.findFirst({ where: { isActive: true } });

  if (!active || active.provider === "mock") {
    return mockProvider;
  }

  if (active.provider === "meta_whatsapp_cloud_api") {
    return new MetaWhatsAppProvider(active.config as unknown as MetaWhatsAppConfig);
  }

  // Other providers (e.g. Telnyx) can be added the same way: implement
  // WhatsAppProvider, then add a case here.
  throw new Error(`No implementation registered for provider "${active.provider}"`);
}

export function getMockProvider(): MockWhatsAppProvider {
  return mockProvider;
}
