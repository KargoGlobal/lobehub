'use client';

import { Text } from '@lobehub/ui/base-ui';
import { useTranslation } from 'react-i18next';

import { formatRemainingTime } from './utils';

interface RemainingTimeProps {
  /** Milliseconds remaining; render nothing above this (0/negative isn't "time left"). */
  ms: number;
}

/**
 * "~Ns left" text for a loading generation. Always reads from the 'image'
 * namespace (like `ActionButtons`) since video reuses this component as-is
 * rather than duplicating the copy.
 */
export function RemainingTime({ ms }: RemainingTimeProps) {
  const { t } = useTranslation('image');

  if (ms <= 0) return null;

  return (
    <Text code fontSize={10} type={'secondary'}>
      {t('generation.status.timeRemaining', { time: formatRemainingTime(ms) })}
    </Text>
  );
}
