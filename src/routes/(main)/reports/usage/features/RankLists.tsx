import { BarList } from '@lobehub/charts';
import { ModelIcon } from '@lobehub/icons';
import { Grid } from '@lobehub/ui';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import StatsFormGroup from '@/features/Settings/stats/features/components/StatsFormGroup';

import type { FailureReasonRow, ModelStat } from './types';

interface RankListsProps {
  failureReasons?: FailureReasonRow[];
  loading: boolean;
  models?: ModelStat[];
}

const RankLists = memo<RankListsProps>(({ failureReasons, loading, models }) => {
  const { t } = useTranslation('usageReport');
  const noDataText = { desc: t('empty.desc'), title: t('empty.title') };

  // Stats come back per model and media type; the ranking is per model.
  const modelRows = useMemo(() => {
    const totals = new Map<string, number>();
    for (const m of models ?? []) totals.set(m.model, (totals.get(m.model) ?? 0) + m.generations);
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([model, value]) => ({
        icon: <ModelIcon model={model} size={20} />,
        id: model,
        name: model,
        value,
      }));
  }, [models]);

  const reasonRows = useMemo(
    () =>
      (failureReasons ?? []).map((r, i) => ({
        id: `${r.errorName}-${i}`,
        name: `${r.errorName}: ${r.message}`,
        value: r.count,
      })),
    [failureReasons],
  );

  return (
    <Grid gap={16} maxItemWidth={360} rows={2} width={'100%'}>
      <StatsFormGroup fontSize={16} title={t('rank.models.title')}>
        <BarList
          data={modelRows}
          height={260}
          leftLabel={t('rank.models.left')}
          loading={loading}
          noDataText={noDataText}
          rightLabel={t('rank.models.right')}
        />
      </StatsFormGroup>
      <StatsFormGroup fontSize={16} title={t('rank.failureReasons.title')}>
        <BarList
          data={reasonRows}
          height={260}
          leftLabel={t('rank.failureReasons.left')}
          loading={loading}
          noDataText={noDataText}
          rightLabel={t('rank.failureReasons.right')}
        />
      </StatsFormGroup>
    </Grid>
  );
});

RankLists.displayName = 'UsageReportRankLists';

export default RankLists;
