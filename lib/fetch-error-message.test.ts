import { describe, expect, it } from 'vitest';

import { getFetchErrorMessage } from './fetch-error-message';

describe('getFetchErrorMessage', () => {
  it('returns Error.message for Error instances', () => {
    expect(getFetchErrorMessage(new Error('Network failed'))).toBe('Network failed');
  });

  it('returns string primitives', () => {
    expect(getFetchErrorMessage('oops')).toBe('oops');
  });

  it('returns a generic message for unknown values', () => {
    expect(getFetchErrorMessage(null)).toBe('Something went wrong. Please try again.');
    expect(getFetchErrorMessage({ code: 1 })).toBe('Something went wrong. Please try again.');
  });
});
