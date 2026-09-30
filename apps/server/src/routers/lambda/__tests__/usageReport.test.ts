// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: vi.fn(() => ({})) }));

const findById = vi.fn();
vi.mock('@/database/models/user', () => ({ UserModel: { findById } }));

const summary = vi.fn();
vi.mock('@/server/services/usageReport', () => ({
  UsageReportService: vi.fn(() => ({ summary })),
}));

const { usageReportRouter } = await import('../usageReport');

const caller = (userId: string) => usageReportRouter.createCaller({ userId } as any);

describe('usageReportRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.USAGE_REPORT_ADMINS = 'Admin@example.com';
  });

  afterEach(() => {
    delete process.env.USAGE_REPORT_ADMINS;
  });

  it('access is true for an allowlisted email', async () => {
    findById.mockResolvedValue({ email: 'admin@example.com' });
    await expect(caller('u1').access()).resolves.toEqual({ allowed: true });
  });

  it('access is false for others and never throws', async () => {
    findById.mockResolvedValue({ email: 'nope@example.com' });
    await expect(caller('u1').access()).resolves.toEqual({ allowed: false });
  });

  it('data procedures reject non-admins with FORBIDDEN', async () => {
    findById.mockResolvedValue({ email: 'nope@example.com' });
    await expect(
      caller('u1').summary({ endAt: '2026-01-10', startAt: '2026-01-01' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(summary).not.toHaveBeenCalled();
  });

  it('converts dates to an inclusive-day range', async () => {
    findById.mockResolvedValue({ email: 'admin@example.com' });
    summary.mockResolvedValue({ ok: true });
    await caller('u1').summary({ endAt: '2026-01-10', mediaType: 'video', startAt: '2026-01-01' });
    expect(summary).toHaveBeenCalledWith(
      expect.objectContaining({
        end: new Date('2026-01-11T00:00:00.000Z'),
        mediaType: 'video',
        start: new Date('2026-01-01T00:00:00.000Z'),
      }),
    );
  });

  it('rejects inverted or oversized ranges', async () => {
    findById.mockResolvedValue({ email: 'admin@example.com' });
    await expect(
      caller('u1').summary({ endAt: '2026-01-01', startAt: '2026-01-10' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      caller('u1').summary({ endAt: '2027-06-01', startAt: '2026-01-01' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
