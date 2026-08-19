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

/** Use the verified email as a useful identity cue when a profile has no real name. */
export function getDisplayName(name: string | undefined, email: string | undefined): string {
  const normalizedName = name?.trim();
  if (normalizedName && normalizedName.toLowerCase() !== 'user') return normalizedName;
  const normalizedEmail = normalizeEmail(email);
  return normalizedEmail?.split('@')[0] || normalizedName || 'Unknown friend';
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

export function normalizePersonName(name: string | undefined): string | null {
  if (name == null || typeof name !== 'string') {
    return null;
  }

  if (hasDisallowedNameCharacters(name)) {
    return null;
  }

  const normalized = name.trim().replace(/\s+/g, ' ');
  if (normalized.length < 2 || normalized.length > 50) {
    return null;
  }

  return normalized;
}

export function getPersonNameErrorMessage(name: string): string {
  if (!name || name.trim().length === 0) {
    return 'Please enter your name';
  }

  if (hasDisallowedNameCharacters(name)) {
    return 'Name cannot include line breaks or hidden characters';
  }

  const normalized = name.trim().replace(/\s+/g, ' ');
  if (normalized.length < 2) {
    return 'Name must be at least 2 characters';
  }

  if (normalized.length > 50) {
    return 'Name must be 50 characters or less';
  }

  return 'Please enter a valid name';
}

function hasDisallowedNameCharacters(name: string): boolean {
  for (const char of name) {
    const code = char.charCodeAt(0);
    const isAllowedWhitespace = char === '\t' || char === ' ';
    if ((code < 32 || code === 127) && !isAllowedWhitespace) {
      return true;
    }
  }

  return /\p{Cf}/u.test(name);
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

/** Formats a completed currency entry while permissive typing stays in normalizeCurrencyInput. */
export function formatCurrencyInput(value: string): string {
  const normalized = normalizeCurrencyInput(value);
  if (!normalized || normalized === '.') return '';

  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount.toFixed(2) : '';
}
