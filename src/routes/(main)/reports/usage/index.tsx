'use client';

import { Flexbox } from '@lobehub/ui';
import { Alert, Button, Text } from '@lobehub/ui/base-ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { useUsageReportAccess } from '@/hooks/useUsageReportAccess';
import { useClientDataSWR } from '@/libs/swr';
import { usageReportKeys } from '@/libs/swr/keys';
import { type UsageReportFiltersInput, usageReportService } from '@/services/usageReport';

import ActiveUsersChart from './features/ActiveUsersChart';
import FailuresTable from './features/FailuresTable';
import FilterBar from './features/FilterBar';
import GenerationsChart from './features/GenerationsChart';
import RankLists from './features/RankLists';
import SummaryTiles from './features/SummaryTiles';
import UserTable from './features/UserTable';
import { useReportFilters } from './useReportFilters';

const useReportData = <T,>(
  enabled: boolean,
  section: string,
  filters: UsageReportFiltersInput,
  fetcher: (f: UsageReportFiltersInput) => Promise<T>,
) =>
  useClientDataSWR(
    enabled ? usageReportKeys.data(section, JSON.stringify(filters)) : null,
    () => fetcher(filters),
    { revalidateOnFocus: false },
  );

const UsageReportPage = () => {
  const { t } = useTranslation('usageReport');
  const navigate = useNavigate();
  const { allowed, isLoading: accessLoading } = useUsageReportAccess();
  const { filters, setState, state } = useReportFilters();

  const summary = useReportData(allowed, 'summary', filters, usageReportService.summary);
  const activeUsers = useReportData(
    allowed,
    'activeUsersByDay',
    filters,
    usageReportService.activeUsersByDay,
  );
  const generations = useReportData(
    allowed,
    'generationsByDay',
    filters,
    usageReportService.generationsByDay,
  );
  const users = useReportData(allowed, 'byUser', filters, usageReportService.byUser);
  const models = useReportData(allowed, 'byModel', filters, usageReportService.byModel);
  const reasons = useReportData(
    allowed,
    'failureReasons',
    filters,
    usageReportService.failureReasons,
  );
  const failures = useReportData(allowed, 'recentFailures', filters, (f) =>
    usageReportService.recentFailures(f, 50),
  );
  const options = useClientDataSWR(
    allowed ? usageReportKeys.data('filterOptions', `${filters.startAt}:${filters.endAt}`) : null,
    () => usageReportService.filterOptions({ endAt: filters.endAt, startAt: filters.startAt }),
    { revalidateOnFocus: false },
  );

  const queries = [summary, activeUsers, generations, users, models, reasons, failures, options];

  if (!accessLoading && !allowed) {
    return (
      <Flexbox padding={24}>
        <Alert
          showIcon
          title={t('forbidden')}
          type={'warning'}
          action={
            <Button size={'small'} onClick={() => navigate('/image')}>
              OK
            </Button>
          }
        />
      </Flexbox>
    );
  }

  const firstError = queries.find((q) => q.error)?.error as { message?: string } | undefined;
  // Data keys are gated on access, so the access check counts as loading too.
  const isLoading = (q: { isLoading: boolean }) => accessLoading || q.isLoading;

  return (
    // The main layout clips overflow, so the page owns its scroll region.
    <Flexbox flex={1} height={'100%'} style={{ overflowY: 'auto' }} width={'100%'}>
      <Flexbox gap={24} padding={24} style={{ margin: '0 auto', maxWidth: 1280, width: '100%' }}>
        <Flexbox horizontal align={'center'} gap={12} justify={'space-between'} wrap={'wrap'}>
          <Flexbox gap={4}>
            <Text as={'h2'} fontSize={24} style={{ margin: 0 }} weight={600}>
              {t('title')}
            </Text>
            <Text type={'secondary'}>
              {t('subtitle', { end: filters.endAt, start: filters.startAt })}
            </Text>
          </Flexbox>
          <Button onClick={() => queries.forEach((q) => q.mutate())}>{t('refresh')}</Button>
        </Flexbox>
        <FilterBar options={options.data} setState={setState} state={state} />
        {firstError && (
          <Alert showIcon title={firstError.message ?? String(firstError)} type={'error'} />
        )}
        <SummaryTiles data={summary.data} loading={isLoading(summary)} />
        <ActiveUsersChart data={activeUsers.data} loading={isLoading(activeUsers)} />
        <GenerationsChart data={generations.data} loading={isLoading(generations)} />
        <RankLists
          failureReasons={reasons.data}
          loading={isLoading(models) || isLoading(reasons)}
          models={models.data}
        />
        <UserTable data={users.data} loading={isLoading(users)} />
        <FailuresTable data={failures.data} loading={isLoading(failures)} />
      </Flexbox>
    </Flexbox>
  );
};

UsageReportPage.displayName = 'UsageReportPage';

export default UsageReportPage;
