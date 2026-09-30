import { ModelIcon } from '@lobehub/icons';
import { Flexbox, Tooltip } from '@lobehub/ui';
import { Tag, Text } from '@lobehub/ui/base-ui';
import { type TableColumnType } from 'antd';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import InlineTable from '@/components/InlineTable';
import StatsFormGroup from '@/features/Settings/stats/features/components/StatsFormGroup';

import EmptyState from './EmptyState';
import type { RecentFailureRow } from './types';

dayjs.extend(utc);

const LongText = ({ value }: { value: string }) => (
  <Tooltip title={value}>
    <Text ellipsis style={{ maxWidth: 280 }}>
      {value}
    </Text>
  </Tooltip>
);

interface FailuresTableProps {
  data?: RecentFailureRow[];
  loading: boolean;
}

const FailuresTable = memo<FailuresTableProps>(({ data, loading }) => {
  const { t } = useTranslation('usageReport');

  const columns: TableColumnType<any>[] = [
    {
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value: string) => (
        <span style={{ textWrap: 'nowrap' }}>{dayjs.utc(value).format('YYYY-MM-DD HH:mm')}</span>
      ),
      title: t('failures.column.time'),
    },
    {
      key: 'user',
      render: (_: unknown, row: RecentFailureRow) => (
        <Flexbox>
          <Text>{row.name}</Text>
          {row.email && (
            <Text fontSize={12} type={'secondary'}>
              {row.email}
            </Text>
          )}
        </Flexbox>
      ),
      title: t('failures.column.user'),
    },
    {
      key: 'model',
      render: (_: unknown, row: RecentFailureRow) => (
        <Flexbox horizontal align={'center'} gap={6}>
          <ModelIcon model={row.model} size={16} />
          <Text>{row.model}</Text>
          <Tag size={'small'}>{t(`filter.mediaType.${row.mediaType}`)}</Tag>
        </Flexbox>
      ),
      title: t('failures.column.model'),
    },
    {
      dataIndex: 'errorName',
      key: 'errorName',
      title: t('failures.column.error'),
    },
    {
      dataIndex: 'message',
      key: 'message',
      render: (value: string) => <LongText value={value} />,
      title: t('failures.column.message'),
    },
    {
      dataIndex: 'prompt',
      key: 'prompt',
      render: (value: string) => <LongText value={value} />,
      title: t('failures.column.prompt'),
    },
  ];

  return (
    <StatsFormGroup fontSize={16} padding={0} title={t('failures.title')}>
      <InlineTable
        columns={columns}
        dataSource={data ?? []}
        loading={loading}
        locale={{ emptyText: <EmptyState /> }}
        pagination={{ hideOnSinglePage: true, pageSize: 20, showSizeChanger: false }}
        rowKey={'generationId'}
      />
    </StatsFormGroup>
  );
});

FailuresTable.displayName = 'UsageReportFailuresTable';

export default FailuresTable;
