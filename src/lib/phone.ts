import { parsePhoneNumberWithError, ParseError } from "libphonenumber-js";

/**
 * Normalizes a phone number to E.164. Defaults to Israeli numbers (IL) when
 * no country code is present, since this is an internal Israeli team tool.
 * Returns null for input that can't be parsed as a valid number.
 */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = parsePhoneNumberWithError(trimmed, "IL");
    return parsed.isValid() ? parsed.number : null;
  } catch (error) {
    if (error instanceof ParseError) {
      return null;
    }
    throw error;
  }
}

export function formatPhoneForDisplay(e164: string): string {
  try {
    return parsePhoneNumberWithError(e164).formatNational();
  } catch {
    return e164;
  }
}
