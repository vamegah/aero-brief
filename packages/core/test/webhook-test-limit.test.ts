import { describe, expect, it } from 'vitest';
import { retryAfterSeconds, testEventAllowed } from '../src/webhooks/test-limit';

const t0 = new Date('2026-11-18T12:00:00.000Z');
const at = (ms: number) => new Date(t0.getTime() + ms);

describe('testEventAllowed', () => {
  it('allows the first request', () => {
    expect(testEventAllowed(null, t0)).toBe(true);
  });
  it('refuses within 60 seconds', () => {
    expect(testEventAllowed(t0, at(0))).toBe(false);
    expect(testEventAllowed(t0, at(59_999))).toBe(false);
  });
  it('allows exactly 60 seconds later and after', () => {
    expect(testEventAllowed(t0, at(60_000))).toBe(true);
    expect(testEventAllowed(t0, at(120_000))).toBe(true);
  });
  it('refuses when lastTestAt is in the future', () => {
    expect(testEventAllowed(at(5_000), t0)).toBe(false);
  });
});

describe('retryAfterSeconds', () => {
  it('returns 60 right after a request', () => {
    expect(retryAfterSeconds(t0, t0)).toBe(60);
  });
  it('rounds up partial seconds', () => {
    expect(retryAfterSeconds(t0, at(59_500))).toBe(1);
    expect(retryAfterSeconds(t0, at(30_000))).toBe(30);
    expect(retryAfterSeconds(t0, at(30_001))).toBe(30);
  });
  it('is at least 1 once the window has passed or with no prior request', () => {
    expect(retryAfterSeconds(t0, at(60_000))).toBe(1);
    expect(retryAfterSeconds(null, t0)).toBe(1);
  });
  it('caps at 60 under clock skew', () => {
    expect(retryAfterSeconds(at(30_000), t0)).toBe(60);
  });
});
