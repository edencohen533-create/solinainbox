import { normalizePhone } from "@/lib/phone";

/** RFC-style quoting, escaped quotes, UTF-8 BOM and CRLF. No formula evaluation. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], value = "", quoted = false, closedQuote = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { value += '"'; i++; }
      else if (char === '"') { quoted = false; closedQuote = true; }
      else value += char;
    } else if (char === '"' && value.length === 0 && !closedQuote) quoted = true;
    else if (char === ',') { row.push(value); value = ""; closedQuote = false; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(value); if (row.some((cell) => cell.trim())) rows.push(row);
      row = []; value = ""; closedQuote = false;
    } else if (closedQuote || char === '"') throw new Error("מרכאות לא תקינות בקובץ CSV");
    else value += char;
  }
  if (quoted) throw new Error("מרכאות לא סגורות בקובץ CSV");
  row.push(value); if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

export function parseContactCsv(text: string) {
  if (text.length > 1_000_000) throw new Error("הקובץ גדול מדי (עד 1MB)");
  const [headers, ...rows] = parseCsv(text);
  if (!headers || !rows.length || rows.length > 5000) throw new Error("יש לייבא בין 1 ל־5,000 שורות");
  const keys = headers.map((h) => h.trim().toLowerCase());
  const nameIndex = keys.findIndex((h) => ["name", "שם"].includes(h));
  const phoneIndex = keys.findIndex((h) => ["phone", "טלפון"].includes(h));
  const consentIndex = keys.indexOf("consentstatus");
  if (nameIndex < 0 || phoneIndex < 0) throw new Error("נדרשות כותרות name,phone (או שם,טלפון)");
  const contacts = new Map<string, { name: string; phone: string; consentStatus: "UNKNOWN" | "OPTED_IN" | "OPTED_OUT" }>();
  for (const [index, row] of rows.entries()) {
    if (row.length !== headers.length) throw new Error(`מספר עמודות לא תקין בשורה ${index + 2}`);
    const name = row[nameIndex]?.trim();
    const phone = normalizePhone(row[phoneIndex] ?? "");
    const consent = consentIndex < 0 ? "UNKNOWN" : row[consentIndex]?.trim() || "UNKNOWN";
    if (!name || name.length > 120 || !phone) throw new Error(`שם או מספר טלפון לא תקין בשורה ${index + 2}`);
    if (!["UNKNOWN", "OPTED_IN", "OPTED_OUT"].includes(consent)) throw new Error(`ערך consentStatus לא תקין בשורה ${index + 2}`);
    const existing = contacts.get(phone);
    // Conflicting consent in duplicates is resolved conservatively.
    const consentStatus = existing ? existing.consentStatus === "OPTED_OUT" || consent === "OPTED_OUT" ? "OPTED_OUT" : existing.consentStatus === "UNKNOWN" || consent === "UNKNOWN" ? "UNKNOWN" : "OPTED_IN" : consent as "UNKNOWN" | "OPTED_IN" | "OPTED_OUT";
    contacts.set(phone, { name, phone, consentStatus });
  }
  return { contacts: [...contacts.values()], duplicateRows: rows.length - contacts.size };
}
