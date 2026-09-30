import { BarChart } from '@lobehub/charts';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import StatsFormGroup from '@/features/Settings/stats/features/components/StatsFormGroup';

import type { ActiveDayRow } from './types';

interface ActiveUsersChartProps {
  data?: ActiveDayRow[];
  loading: boolean;
}

const ActiveUsersChart = memo<ActiveUsersChartProps>(({ data, loading }) => {
  const { t } = useTranslation('usageReport');
  const active = t('chart.activeUsers.active');
  const generating = t('chart.activeUsers.generating');

  const rows = useMemo(
    () =>
      (data ?? []).map((d) => ({
        [active]: d.activeUsers,
        [generating]: d.generatingUsers,
        day: d.day,
      })),
    [data, active, generating],
  );

  return (
    <StatsFormGroup fontSize={16} title={t('chart.activeUsers.title')}>
      <BarChart
        categories={[active, generating]}
        data={rows}
        height={220}
        index={'day'}
        loading={loading}
        noDataText={{ desc: t('empty.desc'), title: t('empty.title') }}
      />
    </StatsFormGroup>
  );
});

ActiveUsersChart.displayName = 'UsageReportActiveUsersChart';

export default ActiveUsersChart;
