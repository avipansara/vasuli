/**
 * Normalizes unknown errors from network/DB calls into a short user-facing string.
 */
export function getFetchErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Something went wrong. Please try again.';
}
