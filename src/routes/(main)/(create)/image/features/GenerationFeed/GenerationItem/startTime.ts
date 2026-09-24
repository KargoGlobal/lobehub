/**
 * Shared sessionStorage-backed "when did this generation start" clock. Both
 * `ElapsedTime` (count-up) and `useEstimatedRemainingMs` (count-down ETA, and
 * video's percent circle) key off the same start time so a page refresh mid-
 * generation keeps showing accurate numbers instead of resetting to zero.
 */
const getSessionStorageKey = (generationId: string) => `generation_start_time_${generationId}`;

/**
 * Returns the recorded start time for a generation, recording "now" the
 * first time it's asked (i.e. when the loading state first mounts).
 */
export const getGenerationStartTime = (generationId: string): number => {
  const storageKey = getSessionStorageKey(generationId);
  const stored = sessionStorage.getItem(storageKey);
  if (stored) return Number(stored);

  const now = Date.now();
  sessionStorage.setItem(storageKey, now.toString());
  return now;
};

export const clearGenerationStartTime = (generationId: string): void => {
  sessionStorage.removeItem(getSessionStorageKey(generationId));
};
