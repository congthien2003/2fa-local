// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { formatOtp, generateTotp, getTimeStep, normalizeSecret } from '../src/totp';

const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('TOTP SHA1, six digits', () => {
  it.each([
    [59_000, '287082'],
    [1_111_111_109_000, '081804'],
    [1_111_111_110_000, '050471'],
    [1_234_567_890_000, '005924'],
    [2_000_000_000_000, '279037'],
    [20_000_000_000_000, '353130'],
  ])('matches the RFC 6238 vector truncated to six digits at %i ms', async (now, expected) => {
    expect(await generateTotp(secret, now)).toBe(expected);
  });

  it('keeps the code within a step and changes at the boundary', async () => {
    expect(await generateTotp(secret, 30_000)).toBe(await generateTotp(secret, 59_999));
    expect(await generateTotp(secret, 29_999)).not.toBe(await generateTotp(secret, 30_000));
    expect(getTimeStep(29_999)).toEqual({ counter: 0, remainingSeconds: 1 });
    expect(getTimeStep(30_000)).toEqual({ counter: 1, remainingSeconds: 30 });
    expect(formatOtp('005924')).toBe('005 924');
  });
});

describe('Base32 input', () => {
  it('normalizes whitespace, case and valid optional padding', async () => {
    expect(normalizeSecret(' my====== \n')).toBe('MY');
    expect(normalizeSecret('jbsw y3dp ehpk3pxp')).toBe('JBSWY3DPEHPK3PXP');
    expect(await generateTotp('MY', 59_000)).toBe(await generateTotp('MY======', 59_000));
  });

  it.each(['', '   ', 'M', 'MZ', 'MY=', 'MY=======', 'MY=MY', 'MY0', 'MY1', 'MY8', 'MY9', 'otpauth://totp/test'])('rejects invalid secret %j', (raw) => {
    expect(() => normalizeSecret(raw)).toThrow();
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid time %s', (now) => {
    expect(() => getTimeStep(now)).toThrow();
  });
});
