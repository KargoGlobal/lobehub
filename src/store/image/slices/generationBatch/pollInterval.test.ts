import { describe, expect, it } from 'vitest';

import {
  getImageStatusPollInterval,
  IMAGE_STATUS_POLL_ERROR_MAX_MS,
  IMAGE_STATUS_POLL_MAX_MS,
} from './pollInterval';

describe('getImageStatusPollInterval', () => {
  it('polls every second for the first few checks', () => {
    expect(getImageStatusPollInterval(0, false)).toBe(1000);
    expect(getImageStatusPollInterval(4, false)).toBe(1000);
  });

  it('backs off to 2s, then caps at 3s', () => {
    expect(getImageStatusPollInterval(5, false)).toBe(2000);
    expect(getImageStatusPollInterval(10, false)).toBe(IMAGE_STATUS_POLL_MAX_MS);
  });

  // Regression: the old backoff reached 16-30s by the time a ~90s generation
  // finished, so a completed image could sit on a blank tile for up to 30s.
  it('never waits more than 3s between checks on a long-running generation', () => {
    for (const count of [20, 25, 40, 100, 1000]) {
      expect(getImageStatusPollInterval(count, false)).toBeLessThanOrEqual(
        IMAGE_STATUS_POLL_MAX_MS,
      );
    }
  });

  it('slows down while the status endpoint is erroring, within a bound', () => {
    expect(getImageStatusPollInterval(0, true)).toBe(2000);
    expect(getImageStatusPollInterval(1000, true)).toBe(6000);
    expect(getImageStatusPollInterval(1000, true)).toBeLessThanOrEqual(
      IMAGE_STATUS_POLL_ERROR_MAX_MS,
    );
  });
});
