import { describe, expect, it } from 'vitest';
import { createOtpResendDeadline, getOtpResendSeconds } from './otp-resend-timer';

describe('getOtpResendSeconds', () => {
  it('returns the remaining whole seconds from an absolute deadline', () => {
    expect(getOtpResendSeconds(60_000, 0)).toBe(60);
    expect(getOtpResendSeconds(60_000, 15_001)).toBe(45);
  });

  it('never returns a negative countdown', () => {
    expect(getOtpResendSeconds(60_000, 60_001)).toBe(0);
  });

  it('handles the absence of an active cooldown', () => {
    expect(getOtpResendSeconds(null, 0)).toBe(0);
  });
});

describe('createOtpResendDeadline', () => {
  it('creates a deadline from the send time', () => {
    expect(createOtpResendDeadline(60_000, 1_000)).toBe(61_000);
  });
});
