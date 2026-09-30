import { ModelIcon } from '@lobehub/icons';
import { Flexbox, Icon } from '@lobehub/ui';
import { Avatar, Button, Text } from '@lobehub/ui/base-ui';
import { type TableColumnType } from 'antd';
import dayjs from 'dayjs';
import { DownloadIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import InlineTable from '@/components/InlineTable';
import StatsFormGroup from '@/features/Settings/stats/features/components/StatsFormGroup';

import { type CsvColumn, downloadCsv, toCsv } from '../csv';
import EmptyState from './EmptyState';
import { formatCount, formatPercent, formatUsd } from './format';
import type { UserRow } from './types';

const byNumber =
  (key: 'error' | 'estimatedCostUsd' | 'generations' | 'images' | 'videos') =>
  (a: UserRow, b: UserRow) =>
    a[key] - b[key];

const CSV_COLUMNS: CsvColumn[] = [
  'name',
  'email',
  'generations',
  'images',
  'videos',
  'error',
  'failRate',
  'topModel',
  'estimatedCostUsd',
  'lastActiveAt',
].map((key) => ({ key, label: key }));

interface UserTableProps {
  data?: UserRow[];
  loading: boolean;
}

const UserTable = memo<UserTableProps>(({ data, loading }) => {
  const { t } = useTranslation('usageReport');

  const columns: TableColumnType<any>[] = [
    {
      key: 'user',
      render: (_: unknown, row: UserRow) => (
        <Flexbox horizontal align={'center'} gap={8}>
          <Avatar avatar={row.avatar ?? undefined} size={24} title={row.name} />
          <Flexbox>
            <Text>{row.name}</Text>
            {row.email && (
              <Text fontSize={12} type={'secondary'}>
                {row.email}
              </Text>
            )}
          </Flexbox>
        </Flexbox>
      ),
      title: t('users.column.user'),
    },
    {
      dataIndex: 'generations',
      defaultSortOrder: 'descend',
      key: 'generations',
      render: formatCount,
      sorter: byNumber('generations'),
      title: t('users.column.generations'),
    },
    {
      dataIndex: 'images',
      key: 'images',
      render: formatCount,
      sorter: byNumber('images'),
      title: t('users.column.images'),
    },
    {
      dataIndex: 'videos',
      key: 'videos',
      render: formatCount,
      sorter: byNumber('videos'),
      title: t('users.column.videos'),
    },
    {
      dataIndex: 'error',
      key: 'error',
      render: formatCount,
      sorter: byNumber('error'),
      title: t('users.column.failures'),
    },
    {
      dataIndex: 'failRate',
      key: 'failRate',
      render: (value: number | null) => formatPercent(value, 0),
      sorter: (a: UserRow, b: UserRow) => (a.failRate ?? -1) - (b.failRate ?? -1),
      title: t('users.column.failRate'),
    },
    {
      dataIndex: 'topModel',
      key: 'topModel',
      render: (value: string | null) =>
        value ? (
          <Flexbox horizontal align={'center'} gap={6}>
            <ModelIcon model={value} size={16} />
            <Text>{value}</Text>
          </Flexbox>
        ) : (
          '—'
        ),
      title: t('users.column.topModel'),
    },
    {
      dataIndex: 'estimatedCostUsd',
      key: 'estimatedCostUsd',
      render: formatUsd,
      sorter: byNumber('estimatedCostUsd'),
      title: t('users.column.cost'),
    },
    {
      dataIndex: 'lastActiveAt',
      key: 'lastActiveAt',
      render: (value: string) => dayjs(value).format('YYYY-MM-DD'),
      sorter: (a: UserRow, b: UserRow) => a.lastActiveAt.localeCompare(b.lastActiveAt),
      title: t('users.column.lastActive'),
    },
  ];

  const exportCsv = () => {
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    downloadCsv('usage-report-users.csv', toCsv(rows, CSV_COLUMNS));
  };

  return (
    <StatsFormGroup
      fontSize={16}
      padding={0}
      title={t('users.title')}
      extra={
        <Button
          disabled={!data || data.length === 0}
          icon={<Icon icon={DownloadIcon} />}
          size={'small'}
          onClick={exportCsv}
        >
          {t('export.csv')}
        </Button>
      }
    >
      <InlineTable
        columns={columns}
        dataSource={data ?? []}
        loading={loading}
        locale={{ emptyText: <EmptyState /> }}
        pagination={{ hideOnSinglePage: true, pageSize: 25, showSizeChanger: false }}
        rowKey={'userId'}
      />
    </StatsFormGroup>
  );
});

UserTable.displayName = 'UsageReportUserTable';

export default UserTable;
