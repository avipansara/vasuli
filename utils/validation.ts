/**
 * Email Validation Utility
 * Common validation functions for email addresses across the app
 */

/**
 * Validates email address format
 * @param email - Email address to validate
 * @returns true if email is valid, false otherwise
 */
export function isEmailValid(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }
  
  // RFC 5322 compliant email regex (simplified version)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Canonical form for auth lookups and storage. Domain matching is case-insensitive per
 * RFC 5321; local parts may be case-sensitive in theory, but we lowercase the full
 * address so sign-in matches rows stored in lowercase (avoids "user not found" for
 * Varun@ vs varun@).
 */
export function normalizeEmail(email: string | undefined): string | undefined {
  if (email == null || typeof email !== 'string') {
    return undefined;
  }
  const trimmed = email.trim().toLowerCase();
  return trimmed.length === 0 ? undefined : trimmed;
}

/**
 * Validates and formats email address
 * @param email - Email address to validate and format
 * @returns Trimmed and lowercase email if valid, null otherwise
 */
export function validateAndFormatEmail(email: string): string | null {
  if (!isEmailValid(email)) {
    return null;
  }
  return normalizeEmail(email) ?? null;
}

/**
 * Gets a user-friendly error message for invalid email
 * @param email - Email address that failed validation
 * @returns Error message string
 */
export function getEmailErrorMessage(email: string): string {
  if (!email || email.trim().length === 0) {
    return 'Please enter an email address';
  }
  if (!email.includes('@')) {
    return 'Email must contain @ symbol';
  }
  if (!email.includes('.')) {
    return 'Email must contain a domain (e.g., .com)';
  }
  return 'Please enter a valid email address';
}

export function normalizeCurrencyInput(value: string): string {
  let normalized = '';
  let hasDecimal = false;

  for (const char of value) {
    if (char >= '0' && char <= '9') {
      normalized += char;
      continue;
    }

    if (char === '.' && !hasDecimal) {
      normalized += char;
      hasDecimal = true;
    }
  }

  const [whole, fractional] = normalized.split('.');
  if (fractional == null) {
    return whole;
  }

  return `${whole}.${fractional.slice(0, 2)}`;
}
