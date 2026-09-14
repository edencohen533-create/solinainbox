import { z } from "zod";
import { AutomationActionType, AutomationTrigger } from "@prisma/client";

export const automationRuleSchema = z.object({
  name: z.string().min(1, "נא להזין שם לחוק"),
  trigger: z.enum(AutomationTrigger),
  triggerConfig: z.record(z.string(), z.any()),
  actionType: z.enum(AutomationActionType),
  actionConfig: z.record(z.string(), z.any()),
  isActive: z.boolean(),
});

export type AutomationRuleInput = z.infer<typeof automationRuleSchema>;
