import { BarChart } from '@lobehub/charts';
import { Segmented } from '@lobehub/ui/base-ui';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import StatsFormGroup from '@/features/Settings/stats/features/components/StatsFormGroup';

import { OUTCOMES } from '../useReportFilters';
import type { GenerationsByDay } from './types';

type Series = keyof GenerationsByDay;

interface GenerationsChartProps {
  data?: GenerationsByDay;
  loading: boolean;
}

const GenerationsChart = memo<GenerationsChartProps>(({ data, loading }) => {
  const { t } = useTranslation('usageReport');
  const [series, setSeries] = useState<Series>('all');

  const labels = useMemo(() => OUTCOMES.map((outcome) => t(`outcome.${outcome}`)), [t]);

  const rows = useMemo(
    () =>
      (data?.[series] ?? []).map((point) => ({
        day: point.day,
        ...Object.fromEntries(OUTCOMES.map((outcome, i) => [labels[i], point[outcome]])),
      })),
    [data, series, labels],
  );

  return (
    <StatsFormGroup
      fontSize={16}
      title={t('chart.generations.title')}
      extra={
        <Segmented<Series>
          size={'small'}
          value={series}
          options={[
            { label: t('chart.generations.all'), value: 'all' },
            { label: t('chart.generations.image'), value: 'image' },
            { label: t('chart.generations.video'), value: 'video' },
          ]}
          onChange={setSeries}
        />
      }
    >
      <BarChart
        stack
        categories={labels}
        data={rows}
        height={260}
        index={'day'}
        loading={loading}
        noDataText={{ desc: t('empty.desc'), title: t('empty.title') }}
      />
    </StatsFormGroup>
  );
});

GenerationsChart.displayName = 'UsageReportGenerationsChart';

export default GenerationsChart;
