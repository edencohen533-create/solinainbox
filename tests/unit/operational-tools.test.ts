import { describe, it, expect } from "vitest";
import { csvCell, csvRows } from "@/lib/csv-export";
import { contactSchema } from "@/lib/validation/contact";
import { automationRuleSchema } from "@/lib/validation/automation";

describe("operational input safety", () => {
  it("exports Hebrew, quotes and newlines without allowing spreadsheet formulas", () => {
    expect(csvCell('=HYPERLINK("evil")')).toBe('"\'=HYPERLINK(""evil"")"');
    expect(csvCell(" \t+cmd")).toBe('"\' \t+cmd"');
    expect(csvCell("דנה\nכהן")).toBe('"דנה\nכהן"');
    expect(csvRows([["name"], ["דנה"]])).toBe('\uFEFF"name"\r\n"דנה"');
  });
  it("rejects duplicate custom-field keys and duplicate tag joins", () => {
    const schema = contactSchema.partial();
    expect(schema.safeParse({ customFields: [{ key: "a", value: "1" }, { key: " a ", value: "2" }] }).success).toBe(false);
    expect(schema.safeParse({ tagIds: ["a", "a"] }).success).toBe(false);
    expect(schema.safeParse({ customFields: [{ key: "מוצר", value: "CRM" }] }).success).toBe(true);
  });
  it("rejects negative timers, empty actions, invalid statuses and non-string variables", () => {
    const rule = { name: "test", trigger: "NO_REPLY_TIMEOUT", triggerConfig: { minutes: 30 }, actionType: "ADD_INTERNAL_NOTE", actionConfig: { body: "hi" }, isActive: true };
    expect(automationRuleSchema.safeParse(rule).success).toBe(true);
    expect(automationRuleSchema.safeParse({ ...rule, triggerConfig: { minutes: -1 } }).success).toBe(false);
    expect(automationRuleSchema.safeParse({ ...rule, actionConfig: {} }).success).toBe(false);
    expect(automationRuleSchema.safeParse({ ...rule, actionType: "CHANGE_STATUS", actionConfig: { status: "bad" } }).success).toBe(false);
    expect(automationRuleSchema.safeParse({ ...rule, actionType: "SEND_TEMPLATE", actionConfig: { templateId: "t", variables: { "1": {} } } }).success).toBe(false);
  });
});
