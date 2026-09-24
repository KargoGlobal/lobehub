import { useEffect, useState } from 'react';

import { getGenerationStartTime } from './startTime';

/**
 * Counts down from `avgLatencyMs` using the same sessionStorage start-time
 * clock as `ElapsedTime`, so image and video loading states can both show
 * "~Ns left" instead of only a count-up.
 *
 * Returns:
 * - `null` when there's no estimate to show yet (not active, or no
 *   `avgLatencyMs` — e.g. this model has no history yet). Callers should
 *   fall back to `ElapsedTime` in this case.
 * - `0` once elapsed time has passed the estimate — also a "fall back to
 *   elapsed" signal, kept distinct from `null` only for callers (like the
 *   video percent circle) that want to know an estimate existed but expired.
 * - A positive number of milliseconds remaining otherwise.
 */
export const useEstimatedRemainingMs = (
  generationId: string,
  avgLatencyMs: number | null | undefined,
  isActive: boolean,
): number | null => {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    if (!isActive || !avgLatencyMs || avgLatencyMs <= 0) {
      setRemainingMs(null);
      return;
    }

    const startTime = getGenerationStartTime(generationId);

    const update = () => {
      const elapsed = Date.now() - startTime;
      const left = avgLatencyMs - elapsed;
      setRemainingMs(left > 0 ? left : 0);
    };

    update();
    const timer = setInterval(update, 1000);

    return () => clearInterval(timer);
  }, [generationId, avgLatencyMs, isActive]);

  return remainingMs;
};
