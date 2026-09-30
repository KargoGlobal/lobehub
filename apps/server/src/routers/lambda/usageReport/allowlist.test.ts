// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { isUsageReportAdmin, parseUsageReportAdmins } from './allowlist';

describe('parseUsageReportAdmins', () => {
  it('splits, trims, lowercases and drops empties', () => {
    expect([...parseUsageReportAdmins(' A@x.com, b@X.com ,, ')]).toEqual(['a@x.com', 'b@x.com']);
  });
  it('is empty when unset', () => {
    expect(parseUsageReportAdmins(undefined).size).toBe(0);
  });
});

describe('isUsageReportAdmin', () => {
  it('matches case-insensitively', () => {
    expect(isUsageReportAdmin('B@x.com', 'a@x.com,b@x.com')).toBe(true);
  });
  it('denies when unset or email missing', () => {
    expect(isUsageReportAdmin('a@x.com', undefined)).toBe(false);
    expect(isUsageReportAdmin(null, 'a@x.com')).toBe(false);
  });
});
