const OTP_LENGTH = 6;

export function parseCompleteOtp(input: string): string[] | null {
  const digits = input.replace(/\D/g, '').slice(0, OTP_LENGTH).split('');
  return digits.length === OTP_LENGTH ? digits : null;
}
