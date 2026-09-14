import { z } from "zod";
import { ConsentStatus } from "@prisma/client";

export const contactSchema = z.object({
  name: z.string().min(1, "נא להזין שם"),
  phone: z.string().min(1, "נא להזין מספר טלפון"),
  email: z.union([z.email("כתובת אימייל לא תקינה"), z.literal("")]).optional(),
  source: z.string().optional(),
  consentStatus: z.enum(ConsentStatus),
  tagIds: z.array(z.string()),
});

export type ContactInput = z.infer<typeof contactSchema>;
