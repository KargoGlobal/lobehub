import { useEffect, useState } from 'react';

import { getGenerationStartTime } from '@/routes/(main)/(create)/image/features/GenerationFeed/GenerationItem/startTime';

export const DEFAULT_AVG_LATENCY_MS = 180_000;

/**
 * Drives the loading percent circle from the same sessionStorage start-time
 * clock as `ElapsedTime`/`useEstimatedRemainingMs`, capped at 99% so it never
 * visually "finishes" before the task actually does.
 */
export const useEstimatedProgress = (
  generationId: string,
  avgLatencyMs: number,
  isActive: boolean,
): number | null => {
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    if (!isActive) {
      setProgress(null);
      return;
    }

    const startTime = getGenerationStartTime(generationId);

    const update = () => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(Math.round((elapsed / avgLatencyMs) * 100), 99);
      setProgress(pct);
    };

    update();
    const timer = setInterval(update, 1000);

    return () => clearInterval(timer);
  }, [isActive, avgLatencyMs, generationId]);

  return progress;
};
