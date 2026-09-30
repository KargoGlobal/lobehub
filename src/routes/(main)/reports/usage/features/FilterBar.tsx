import { ModelIcon } from '@lobehub/icons';
import { Flexbox } from '@lobehub/ui';
import { Segmented, Select, Text } from '@lobehub/ui/base-ui';
import { DatePicker } from 'antd';
import dayjs from 'dayjs';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { UsageReportMediaType, UsageReportOutcome } from '@/services/usageReport';

import {
  OUTCOMES,
  RANGE_PRESETS,
  type RangePreset,
  type ReportFilterState,
} from '../useReportFilters';
import type { FilterOptions } from './types';

const DAY_FORMAT = 'YYYY-MM-DD';
const ALL = 'all';

const toList = (value: string | string[] | null | undefined): string[] =>
  Array.isArray(value) ? value : value ? [value] : [];

interface FilterBarProps {
  options?: FilterOptions;
  setState: (patch: Partial<ReportFilterState>) => void;
  state: ReportFilterState;
}

const FilterBar = memo<FilterBarProps>(({ options, setState, state }) => {
  const { t } = useTranslation('usageReport');

  const modelOptions = useMemo(() => {
    const seen = new Set<string>();
    return (options?.models ?? [])
      .filter(({ model }) => (seen.has(model) ? false : (seen.add(model), true)))
      .map(({ model }) => ({
        label: (
          <Flexbox horizontal align={'center'} gap={8}>
            <ModelIcon model={model} size={16} />
            {model}
          </Flexbox>
        ),
        title: model,
        value: model,
      }));
  }, [options?.models]);

  const userOptions = useMemo(
    () =>
      (options?.users ?? []).map(({ email, name, userId }) => ({
        label: (
          <Flexbox horizontal align={'baseline'} gap={6}>
            {name}
            {email && (
              <Text fontSize={12} type={'secondary'}>
                {email}
              </Text>
            )}
          </Flexbox>
        ),
        title: email ? `${name} ${email}` : name,
        value: userId,
      })),
    [options?.users],
  );

  return (
    <Flexbox horizontal align={'center'} gap={12} wrap={'wrap'}>
      <Segmented<RangePreset>
        value={state.range}
        options={[
          ...RANGE_PRESETS.map((preset) => ({ label: t(`filter.range.${preset}`), value: preset })),
          { label: t('filter.customRange'), value: 'custom' as const },
        ]}
        onChange={(range) =>
          setState(range === 'custom' ? { range } : { end: null, range, start: null })
        }
      />
      {state.range === 'custom' && (
        <DatePicker.RangePicker
          allowClear={false}
          value={
            state.start && state.end
              ? [dayjs(state.start, DAY_FORMAT), dayjs(state.end, DAY_FORMAT)]
              : undefined
          }
          onChange={(dates) => {
            if (!dates?.[0] || !dates?.[1]) return;
            setState({ end: dates[1].format(DAY_FORMAT), start: dates[0].format(DAY_FORMAT) });
          }}
        />
      )}
      <Segmented<UsageReportMediaType | typeof ALL>
        value={state.mediaType ?? ALL}
        options={[
          { label: t('filter.mediaType.all'), value: ALL },
          { label: t('filter.mediaType.image'), value: 'image' },
          { label: t('filter.mediaType.video'), value: 'video' },
        ]}
        onChange={(value) => setState({ mediaType: value === ALL ? null : value })}
      />
      <Select
        allowClear
        showSearch
        mode={'multiple'}
        options={modelOptions}
        placeholder={t('filter.models')}
        style={{ minWidth: 200 }}
        value={state.models}
        onChange={(models) => setState({ models: toList(models) })}
      />
      <Select
        allowClear
        showSearch
        mode={'multiple'}
        options={userOptions}
        placeholder={t('filter.users')}
        style={{ minWidth: 200 }}
        value={state.users}
        onChange={(users) => setState({ users: toList(users) })}
      />
      <Select
        allowClear
        options={OUTCOMES.map((outcome) => ({
          label: t(`filter.status.${outcome}`),
          value: outcome,
        }))}
        placeholder={t('filter.status.all')}
        style={{ minWidth: 140 }}
        value={state.status}
        onChange={(status) => setState({ status: (status as UsageReportOutcome | null) ?? null })}
      />
    </Flexbox>
  );
});

FilterBar.displayName = 'UsageReportFilterBar';

export default FilterBar;
