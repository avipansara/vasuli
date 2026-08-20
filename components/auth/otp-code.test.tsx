import { describe, expect, it } from 'vitest';

import { parseCompleteOtp } from './otp-code';

describe('parseCompleteOtp', () => {
  it('returns six OTP digits from native autofill or pasted formatted text', () => {
    expect(parseCompleteOtp('123456')).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(parseCompleteOtp('Code: 12 34-56')).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
    ]);
  });

  it('rejects incomplete input', () => {
    expect(parseCompleteOtp('12345')).toBeNull();
    expect(parseCompleteOtp('not a code')).toBeNull();
  });
});
