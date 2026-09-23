import { describe, expect, it } from "vitest";
import { parseCsv, parseContactCsv } from "@/lib/contact-csv";
describe("contact CSV import", () => {
  it("handles BOM, Hebrew, CRLF, quoted commas, escaped quotes and newlines", () => {
    expect(parseCsv('\uFEFFname,phone\r\n"דנה, ""כהן""\nלוי",0501234567\r\n')).toEqual([["name", "phone"], ['דנה, "כהן"\nלוי', "0501234567"]]);
  });
  it("does not infer marketing consent", () => {
    expect(parseContactCsv("name,phone\nDana,0501234567").contacts[0]).toEqual({ name: "Dana", phone: "+972501234567", consentStatus: "UNKNOWN" });
  });
  it("normalizes and deduplicates phones while retaining opt-out", () => {
    const result = parseContactCsv("name,phone,consentStatus\nDana,0501234567,OPTED_IN\nDana,+972501234567,OPTED_OUT");
    expect(result.duplicateRows).toBe(1); expect(result.contacts[0].consentStatus).toBe("OPTED_OUT");
  });
  it("rejects malformed input with a row number", () => {
    expect(() => parseContactCsv("name,phone\nDana,wrong")).toThrow("2");
    expect(() => parseContactCsv('name,phone\n"Dana,123')).toThrow("מרכאות");
    expect(() => parseContactCsv("name,phone,consentStatus\nDana,0501234567,yes")).toThrow("consentStatus");
  });
});
