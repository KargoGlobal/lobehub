// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = {
  activeUsersByDay: vi.fn(),
  byModel: vi.fn(),
  byUser: vi.fn(),
  costInputs: vi.fn(),
  generationsByDay: vi.fn(),
  summaryCounts: vi.fn(),
};
vi.mock('@/database/models/usageReport', () => ({ UsageReportModel: vi.fn(() => m) }));

const { UsageReportService, eachUtcDay } = await import('./index');

const range = { end: new Date('2026-01-11T00:00:00Z'), start: new Date('2026-01-08T00:00:00Z') };
const pricing = new Map([['m/flat', { kind: 'image' as const, rate: 0.5 }]]);

describe('eachUtcDay', () => {
  it('lists every day in [start, end)', () => {
    expect(eachUtcDay(range)).toEqual(['2026-01-08', '2026-01-09', '2026-01-10']);
  });

  it('keeps the same first day regardless of a non-midnight start time', () => {
    const r = { end: new Date('2026-01-09T00:00:00Z'), start: new Date('2026-01-08T15:30:00Z') };
    expect(eachUtcDay(r)).toEqual(['2026-01-08']);
  });
});

describe('UsageReportService', () => {
  const service = new UsageReportService({} as any, pricing);
  beforeEach(() => vi.clearAllMocks());

  it('summary adds cost and success rate', async () => {
    m.summaryCounts.mockResolvedValue({
      active: 0,
      activeUsers: 2,
      cancelled: 1,
      error: 1,
      generatingUsers: 2,
      generations: 5,
      newSignups: 0,
      success: 3,
      totalUsers: 4,
    });
    m.costInputs.mockResolvedValue([
      {
        megapixels: 0,
        mediaType: 'image',
        model: 'm/flat',
        seconds: 0,
        successCount: 3,
        userId: 'u',
      },
    ]);
    await expect(service.summary(range)).resolves.toMatchObject({
      estimatedCostUsd: 1.5,
      successRate: 0.75,
      unpricedGenerations: 0,
    });
  });

  it('generationsByDay zero-fills and pivots outcomes per media type', async () => {
    m.generationsByDay.mockResolvedValue([
      { count: 2, day: '2026-01-09', mediaType: 'image', outcome: 'success' },
      { count: 1, day: '2026-01-09', mediaType: 'video', outcome: 'error' },
    ]);
    const r = await service.generationsByDay(range);
    expect(r.all.map((d) => d.day)).toEqual(['2026-01-08', '2026-01-09', '2026-01-10']);
    expect(r.all[1]).toEqual({ active: 0, cancelled: 0, day: '2026-01-09', error: 1, success: 2 });
    expect(r.image[1].success).toBe(2);
    expect(r.video[1].error).toBe(1);
    expect(r.video[0]).toEqual({
      active: 0,
      cancelled: 0,
      day: '2026-01-08',
      error: 0,
      success: 0,
    });
  });

  it('activeUsersByDay zero-fills', async () => {
    m.activeUsersByDay.mockResolvedValue([
      { activeUsers: 1, day: '2026-01-10', generatingUsers: 1 },
    ]);
    const r = await service.activeUsersByDay(range);
    expect(r).toEqual([
      { activeUsers: 0, day: '2026-01-08', generatingUsers: 0 },
      { activeUsers: 0, day: '2026-01-09', generatingUsers: 0 },
      { activeUsers: 1, day: '2026-01-10', generatingUsers: 1 },
    ]);
  });

  it('byUser attaches per-user cost and fail rate, scoped to that user only', async () => {
    m.byUser.mockResolvedValue([
      {
        active: 0,
        avatar: null,
        cancelled: 0,
        createdAt: 'x',
        email: 'a',
        error: 1,
        generations: 3,
        images: 3,
        lastActiveAt: 'x',
        name: 'A',
        success: 2,
        topModel: 'm/flat',
        userId: 'u',
        videos: 0,
      },
      {
        active: 0,
        avatar: null,
        cancelled: 0,
        createdAt: 'x',
        email: 'b',
        error: 0,
        generations: 5,
        images: 5,
        lastActiveAt: 'x',
        name: 'B',
        success: 5,
        topModel: 'm/flat',
        userId: 'u2',
        videos: 0,
      },
    ]);
    // decoy row for u2 ensures byUser's per-user filter is actually exercised:
    // if the filter were dropped, u's cost would wrongly include u2's rows too.
    m.costInputs.mockResolvedValue([
      {
        megapixels: 0,
        mediaType: 'image',
        model: 'm/flat',
        seconds: 0,
        successCount: 2,
        userId: 'u',
      },
      {
        megapixels: 0,
        mediaType: 'image',
        model: 'm/flat',
        seconds: 0,
        successCount: 5,
        userId: 'u2',
      },
    ]);
    const [u, u2] = await service.byUser(range);
    expect(u.estimatedCostUsd).toBe(1);
    expect(u.failRate).toBeCloseTo(1 / 3);
    expect(u2.estimatedCostUsd).toBe(2.5);
  });

  it('byModel attaches cost and fail rate per model+mediaType, null when no finished rows', async () => {
    m.byModel.mockResolvedValue([
      { error: 0, generations: 2, mediaType: 'image', model: 'm/flat', provider: 'p', success: 2 },
      { error: 1, generations: 2, mediaType: 'video', model: 'm/flat', provider: 'p', success: 1 },
      { error: 0, generations: 0, mediaType: 'image', model: 'm/none', provider: 'p', success: 0 },
    ]);
    // decoy row for the video mediaType ensures byModel's model+mediaType filter is
    // actually exercised: if the filter were dropped, the image row's cost would
    // wrongly include the video row's successCount too.
    m.costInputs.mockResolvedValue([
      {
        megapixels: 0,
        mediaType: 'image',
        model: 'm/flat',
        seconds: 0,
        successCount: 2,
        userId: 'u',
      },
      {
        megapixels: 0,
        mediaType: 'video',
        model: 'm/flat',
        seconds: 0,
        successCount: 1,
        userId: 'u',
      },
    ]);
    const [imageRow, videoRow, noneRow] = await service.byModel(range);
    expect(imageRow.estimatedCostUsd).toBe(1);
    expect(videoRow).toMatchObject({ estimatedCostUsd: 0.5, failRate: 0.5 });
    expect(noneRow).toMatchObject({ estimatedCostUsd: 0, failRate: null });
  });
});
