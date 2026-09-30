import { Block, Flexbox, Grid } from '@lobehub/ui';
import { Skeleton, Text } from '@lobehub/ui/base-ui';
import { type ReactNode } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { formatCount, formatPercent, formatUsd } from './format';
import type { Summary } from './types';

interface TileProps {
  caption?: ReactNode;
  label: string;
  loading: boolean;
  value?: ReactNode;
}

const Tile = memo<TileProps>(({ caption, label, loading, value }) => (
  <Block gap={8} padding={16} variant={'outlined'}>
    <Text fontSize={13} type={'secondary'}>
      {label}
    </Text>
    {loading ? (
      <Skeleton height={32} width={96} />
    ) : (
      <Flexbox gap={2}>
        <Text fontSize={24} weight={600}>
          {value ?? '—'}
        </Text>
        {caption && (
          <Text fontSize={12} type={'secondary'}>
            {caption}
          </Text>
        )}
      </Flexbox>
    )}
  </Block>
));

interface SummaryTilesProps {
  data?: Summary;
  loading: boolean;
}

const SummaryTiles = memo<SummaryTilesProps>(({ data, loading }) => {
  const { t } = useTranslation('usageReport');

  return (
    <Grid gap={12} maxItemWidth={180} rows={7} width={'100%'}>
      <Tile
        label={t('summary.activeUsers')}
        loading={loading}
        value={data && formatCount(data.activeUsers)}
      />
      <Tile
        label={t('summary.totalUsers')}
        loading={loading}
        value={data && formatCount(data.totalUsers)}
      />
      <Tile
        label={t('summary.newSignups')}
        loading={loading}
        value={data && formatCount(data.newSignups)}
      />
      <Tile
        label={t('summary.generations')}
        loading={loading}
        value={data && formatCount(data.generations)}
      />
      <Tile
        label={t('summary.successRate')}
        loading={loading}
        value={data && formatPercent(data.successRate)}
      />
      <Tile
        label={t('summary.failures')}
        loading={loading}
        value={data && formatCount(data.error)}
      />
      <Tile
        label={t('summary.cost')}
        loading={loading}
        value={data && formatUsd(data.estimatedCostUsd)}
        caption={
          data && data.unpricedGenerations > 0
            ? `(${t('summary.costUnpriced', { count: data.unpricedGenerations })})`
            : undefined
        }
      />
    </Grid>
  );
});

SummaryTiles.displayName = 'UsageReportSummaryTiles';

export default SummaryTiles;
