import { z } from "zod";

export const metaProviderConfigSchema = z.object({
  accessToken: z.string().min(1, "נא להזין Access Token"),
  phoneNumberId: z.string().min(1, "נא להזין Phone Number ID"),
  webhookVerifyToken: z.string().min(1, "נא להזין Webhook Verify Token"),
  appSecret: z.string().optional(),
});

export type MetaProviderConfigInput = z.infer<typeof metaProviderConfigSchema>;
