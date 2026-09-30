import { describe, expect, it } from 'vitest';

import { resolveRange, toFiltersInput } from './useReportFilters';

const today = new Date('2026-09-30T15:00:00Z');

describe('resolveRange', () => {
  it('maps presets to inclusive UTC day ranges ending today', () => {
    expect(resolveRange('7d', null, null, today)).toEqual({
      endAt: '2026-09-30',
      startAt: '2026-09-24',
    });
    expect(resolveRange('14d', null, null, today)).toEqual({
      endAt: '2026-09-30',
      startAt: '2026-09-17',
    });
    expect(resolveRange('90d', null, null, today)).toEqual({
      endAt: '2026-09-30',
      startAt: '2026-07-03',
    });
  });
  it('uses custom bounds when valid, else falls back to 14d', () => {
    expect(resolveRange('custom', '2026-01-01', '2026-01-31', today)).toEqual({
      endAt: '2026-01-31',
      startAt: '2026-01-01',
    });
    expect(resolveRange('custom', '2026-02-01', '2026-01-31', today)).toEqual({
      endAt: '2026-09-30',
      startAt: '2026-09-17',
    });
    expect(resolveRange('custom', null, null, today)).toEqual({
      endAt: '2026-09-30',
      startAt: '2026-09-17',
    });
  });
});

describe('toFiltersInput', () => {
  it('drops empty filters', () => {
    expect(
      toFiltersInput(
        {
          end: null,
          mediaType: null,
          models: [],
          range: '7d',
          start: null,
          status: null,
          users: [],
        },
        today,
      ),
    ).toEqual({ endAt: '2026-09-30', startAt: '2026-09-24' });
  });
  it('passes populated filters through', () => {
    expect(
      toFiltersInput(
        {
          end: null,
          mediaType: 'video',
          models: ['a'],
          range: '7d',
          start: null,
          status: 'error',
          users: ['u'],
        },
        today,
      ),
    ).toMatchObject({ mediaType: 'video', models: ['a'], status: 'error', userIds: ['u'] });
  });
});
