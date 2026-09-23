import { describe, expect, it } from "vitest";
import { eligibilityError, isUnsubscribe } from "@/lib/message-policy";
import { validateTemplateVariables } from "@/lib/campaigns";
import { previousStatuses } from "@/server/services/message-status-service";
describe("marketing and service eligibility", () => {
  it("allows a requested service reply after marketing opt-out, but never a campaign", () => {
    expect(eligibilityError({ consentStatus: "OPTED_OUT" }, false, true)).toBeNull();
    expect(eligibilityError({ consentStatus: "OPTED_OUT" }, true, true)).toBeTruthy();
    expect(eligibilityError({ consentStatus: "UNKNOWN" }, false, false)).toBeTruthy();
    expect(eligibilityError({ consentStatus: "OPTED_IN", isBlocked: true }, false, true)).toBeTruthy();
  });
  it.each(["הסר אותי!", "הסירו אותי", "STOP.", " unsubscribe ", "remove me", "stop all"])("recognizes explicit removal: %s", (value) => expect(isUnsubscribe(value)).toBe(true));
  it.each(["אל תסיר אותי", "please stop by tomorrow", "אני רוצה להסביר"])("does not treat unrelated text as opt-out: %s", (value) => expect(isUnsubscribe(value)).toBe(false));
  it("rejects unresolved custom fields before dispatch", () => {
    expect(() => validateTemplateVariables("שלום {{1}}", { "1": "{missing}" })).toThrow();
    expect(() => validateTemplateVariables("שלום {{1}}", { "1": "{{2}}" })).toThrow();
  });
  it("acceptance is not delivery, and late callbacks never downgrade a read", () => {
    expect(previousStatuses("DELIVERED")).toContain("ACCEPTED");
    expect(previousStatuses("DELIVERED")).not.toContain("READ");
    expect(previousStatuses("SENT")).not.toContain("DELIVERED");
    expect(previousStatuses("FAILED")).not.toContain("READ");
  });
});
