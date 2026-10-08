/**
 * Polling cadence for an in-flight image generation's status.
 *
 * Each image in a batch is its own async task, so results can land one at a
 * time — but only as fast as we poll. A pure exponential backoff (doubling
 * every 5 requests up to 30s) meant that by the time a ~90s generation
 * finished, a tile could sit on a blank placeholder for up to 30s after its
 * sibling had already rendered. Status checks are a cheap DB read, so keep
 * the cadence tight: 1s for the first few checks, then 2s, capped at 3s.
 */
export const IMAGE_STATUS_POLL_BASE_MS = 1000;
export const IMAGE_STATUS_POLL_MAX_MS = 3000;
/** Upper bound while the status endpoint itself is erroring. */
export const IMAGE_STATUS_POLL_ERROR_MAX_MS = 10_000;

export const getImageStatusPollInterval = (requestCount: number, hadError: boolean): number => {
  const backoffMultiplier = Math.floor(requestCount / 5);
  const interval = Math.min(
    IMAGE_STATUS_POLL_BASE_MS * Math.pow(2, backoffMultiplier),
    IMAGE_STATUS_POLL_MAX_MS,
  );

  return hadError ? Math.min(interval * 2, IMAGE_STATUS_POLL_ERROR_MAX_MS) : interval;
};
