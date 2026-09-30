import { useCallback, useMemo } from 'react';

import { parseAsString, parseAsStringEnum, useQueryStates } from '@/hooks/useQueryParam';
import type {
  UsageReportFiltersInput,
  UsageReportMediaType,
  UsageReportOutcome,
} from '@/services/usageReport';

export type RangePreset = '7d' | '14d' | '30d' | '90d' | 'custom';

export const RANGE_PRESETS = ['7d', '14d', '30d', '90d'] as const;
export const OUTCOMES: readonly UsageReportOutcome[] = ['success', 'error', 'cancelled', 'active'];

export interface ReportFilterState {
  end: string | null;
  mediaType: UsageReportMediaType | null;
  models: string[];
  range: RangePreset;
  start: string | null;
  status: UsageReportOutcome | null;
  users: string[];
}

const PRESET_DAYS: Record<Exclude<RangePreset, 'custom'>, number> = {
  '14d': 14,
  '30d': 30,
  '7d': 7,
  '90d': 90,
};
const DAY_MS = 86_400_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const utcDay = (d: Date) => d.toISOString().slice(0, 10);

export const resolveRange = (
  preset: RangePreset,
  start: string | null,
  end: string | null,
  today: Date = new Date(),
): { endAt: string; startAt: string } => {
  if (
    preset === 'custom' &&
    start &&
    end &&
    ISO_DAY.test(start) &&
    ISO_DAY.test(end) &&
    start <= end
  ) {
    return { endAt: end, startAt: start };
  }
  const days = preset === 'custom' ? PRESET_DAYS['14d'] : PRESET_DAYS[preset];
  const endDay = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return {
    endAt: utcDay(new Date(endDay)),
    startAt: utcDay(new Date(endDay - (days - 1) * DAY_MS)),
  };
};

export const toFiltersInput = (
  state: ReportFilterState,
  today?: Date,
): UsageReportFiltersInput => ({
  ...resolveRange(state.range, state.start, state.end, today),
  ...(state.mediaType ? { mediaType: state.mediaType } : {}),
  ...(state.models.length > 0 ? { models: state.models } : {}),
  ...(state.status ? { status: state.status } : {}),
  ...(state.users.length > 0 ? { userIds: state.users } : {}),
});

const splitList = (v: string | null): string[] => (v ? v.split(',').filter(Boolean) : []);
const joinList = (v: string[]): string | null => (v.length > 0 ? v.join(',') : null);

const parsers = {
  end: parseAsString,
  models: parseAsString,
  range: parseAsStringEnum<RangePreset>([...RANGE_PRESETS, 'custom']),
  start: parseAsString,
  status: parseAsStringEnum<UsageReportOutcome>(OUTCOMES),
  type: parseAsStringEnum<UsageReportMediaType>(['image', 'video']),
  users: parseAsString,
};

export const useReportFilters = (): {
  filters: UsageReportFiltersInput;
  setState: (patch: Partial<ReportFilterState>) => void;
  state: ReportFilterState;
} => {
  const [query, setQuery] = useQueryStates(parsers);

  const state = useMemo<ReportFilterState>(
    () => ({
      end: query.end ?? null,
      mediaType: query.type ?? null,
      models: splitList(query.models ?? null),
      range: query.range ?? '14d',
      start: query.start ?? null,
      status: query.status ?? null,
      users: splitList(query.users ?? null),
    }),
    [query.end, query.models, query.range, query.start, query.status, query.type, query.users],
  );

  const setState = useCallback(
    (patch: Partial<ReportFilterState>) => {
      setQuery({
        ...(patch.end !== undefined ? { end: patch.end } : {}),
        ...(patch.mediaType !== undefined ? { type: patch.mediaType } : {}),
        ...(patch.models !== undefined ? { models: joinList(patch.models) } : {}),
        ...(patch.range !== undefined ? { range: patch.range } : {}),
        ...(patch.start !== undefined ? { start: patch.start } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.users !== undefined ? { users: joinList(patch.users) } : {}),
      });
    },
    [setQuery],
  );

  const filters = useMemo(() => toFiltersInput(state), [state]);

  return { filters, setState, state };
};
