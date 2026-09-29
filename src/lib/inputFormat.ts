import { AsYouType, parsePhoneNumberFromString } from "libphonenumber-js";

// ------- Email -------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(v: string): string {
  const s = (v ?? "").trim();
  const i = s.lastIndexOf("@");
  return i < 0 ? s : s.slice(0, i) + "@" + s.slice(i + 1).toLowerCase();
}

export function isValidEmail(v: string): boolean {
  if (!v) return false;
  return EMAIL_RE.test(v.trim());
}

// ------- Phone -------

export const DEFAULT_PHONE_REGION = "BR" as const;

/**
 * Format a phone string as the user types. Preserves a leading "+" so
 * libphonenumber switches into international parsing mode automatically.
 */
export function formatPhoneAsYouType(v: string, region: string = DEFAULT_PHONE_REGION): string {
  if (!v) return "";
  return new AsYouType(region as any).input(v);
}

/**
 * Parse to canonical E.164 ("+5511980937193"). Returns null if not valid.
 */
export function toE164(v: string, region: string = DEFAULT_PHONE_REGION): string | null {
  if (!v) return null;
  try {
    const p = parsePhoneNumberFromString(v, region as any);
    return p && p.isValid() ? p.number : null;
  } catch {
    return null;
  }
}

/**
 * Format a stored value (E.164 or free text) for display.
 * Falls back to the raw value if it can't be parsed.
 */
export function formatPhoneDisplay(v: string, region: string = DEFAULT_PHONE_REGION): string {
  if (!v) return "";
  try {
    const p = parsePhoneNumberFromString(v, region as any);
    if (p) return p.formatInternational();
  } catch {}
  return v;
}