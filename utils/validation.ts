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
 * Validates and formats email address
 * @param email - Email address to validate and format
 * @returns Trimmed and lowercase email if valid, null otherwise
 */
export function validateAndFormatEmail(email: string): string | null {
  if (!isEmailValid(email)) {
    return null;
  }
  return email.trim().toLowerCase();
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
