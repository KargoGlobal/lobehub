// @vitest-environment node
import { AsyncTaskStatus, AsyncTaskType } from '@lobechat/types';
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import {
  asyncTasks,
  generationBatches,
  generations,
  generationTopics,
  session,
  users,
} from '../../schemas';
import type { LobeChatDatabase } from '../../type';
import { UsageReportModel } from '../usageReport';

const serverDB: LobeChatDatabase = await getTestDB();
const model = new UsageReportModel(serverDB);

const day = (d: string, hour = 12) => new Date(`${d}T${String(hour).padStart(2, '0')}:00:00.000Z`);

const U1 = 'ur-user-1';
const U2 = 'ur-user-2';
const U3 = 'ur-user-3'; // signed in via last_active_at only, never generated

interface SeedGen {
  asset?: boolean;
  createdAt: Date;
  duration?: number;
  errorName?: string;
  height?: number | null;
  id: string;
  model: string;
  status?: AsyncTaskStatus;
  type?: AsyncTaskType;
  userId: string;
  width?: number | null;
  withTask?: boolean;
}

const seedGeneration = async (g: SeedGen) => {
  const topicId = `topic-${g.id}`;
  await serverDB.insert(generationTopics).values({ id: topicId, title: 't', userId: g.userId });
  const batchId = `batch-${g.id}`;
  await serverDB.insert(generationBatches).values({
    config: g.duration ? { duration: g.duration } : {},
    createdAt: g.createdAt,
    generationTopicId: topicId,
    height: g.height ?? null,
    id: batchId,
    model: g.model,
    prompt: `prompt for ${g.id}`,
    provider: 'fal',
    userId: g.userId,
    width: g.width ?? null,
  });
  let asyncTaskId: string | null = null;
  if (g.withTask !== false) {
    const [task] = await serverDB
      .insert(asyncTasks)
      .values({
        createdAt: g.createdAt,
        error: g.errorName
          ? { body: { detail: `${g.errorName} happened` }, name: g.errorName }
          : null,
        status: g.status ?? AsyncTaskStatus.Success,
        type: g.type ?? AsyncTaskType.ImageGeneration,
        userId: g.userId,
      })
      .returning({ id: asyncTasks.id });
    asyncTaskId = task.id;
  }
  await serverDB.insert(generations).values({
    asset: g.asset === false ? null : { type: 'image', url: `https://x/${g.id}.png` },
    asyncTaskId,
    createdAt: g.createdAt,
    generationBatchId: batchId,
    id: g.id,
    userId: g.userId,
  });
};

beforeEach(async () => {
  await serverDB.insert(users).values([
    {
      createdAt: day('2026-01-01'),
      email: 'one@example.com',
      fullName: 'One',
      id: U1,
      lastActiveAt: day('2026-01-10'),
    },
    {
      createdAt: day('2026-01-05'),
      email: 'two@example.com',
      id: U2,
      lastActiveAt: day('2026-01-09'),
      username: 'two',
    },
    {
      createdAt: day('2025-12-01'),
      email: 'three@example.com',
      id: U3,
      lastActiveAt: day('2026-01-08'),
    },
  ]);

  // U1: 2 image successes (2026-01-08, 2026-01-09), 1 image error (01-09), 1 video success 8s (01-10)
  await seedGeneration({
    createdAt: day('2026-01-08'),
    height: 1024,
    id: 'g1',
    model: 'fal-ai/flux/schnell',
    userId: U1,
    width: 1024,
  });
  await seedGeneration({
    createdAt: day('2026-01-09'),
    height: 1024,
    id: 'g2',
    model: 'fal-ai/flux/schnell',
    userId: U1,
    width: 1024,
  });
  await seedGeneration({
    createdAt: day('2026-01-09', 13),
    errorName: 'ProviderBizError',
    id: 'g3',
    model: 'fal-ai/nano-banana-2',
    status: AsyncTaskStatus.Error,
    userId: U1,
  });
  await seedGeneration({
    createdAt: day('2026-01-10'),
    duration: 8,
    id: 'g4',
    model: 'fal-ai/veo3.1',
    type: AsyncTaskType.VideoGeneration,
    userId: U1,
  });
  // U2: 1 cancelled video (01-09), 1 active image (01-10), 1 taskless success (01-07)
  await seedGeneration({
    createdAt: day('2026-01-09'),
    duration: 6,
    errorName: 'TaskCancelled',
    id: 'g5',
    model: 'fal-ai/veo3.1',
    status: AsyncTaskStatus.Error,
    type: AsyncTaskType.VideoGeneration,
    userId: U2,
  });
  await seedGeneration({
    asset: false,
    createdAt: day('2026-01-10'),
    id: 'g6',
    model: 'fal-ai/flux/schnell',
    status: AsyncTaskStatus.Processing,
    userId: U2,
  });
  await seedGeneration({
    createdAt: day('2026-01-07'),
    id: 'g7',
    model: 'fal-ai/flux/schnell',
    userId: U2,
    withTask: false,
  });
});

afterEach(async () => {
  await serverDB.delete(generations);
  await serverDB.delete(generationBatches);
  await serverDB.delete(generationTopics);
  await serverDB.delete(asyncTasks);
  await serverDB.delete(session);
  await serverDB.delete(users);
});

const RANGE = { end: day('2026-01-11', 0), start: day('2026-01-08', 0) };

describe('UsageReportModel.summaryCounts', () => {
  it('counts users, signups and outcomes in range', async () => {
    const s = await model.summaryCounts(RANGE);
    expect(s).toEqual({
      active: 1,
      activeUsers: 3, // U1, U2 generated; U3 via last_active_at
      cancelled: 1,
      error: 1,
      generatingUsers: 2,
      generations: 6, // g1..g6 (g7 is 01-07, outside)
      newSignups: 0,
      success: 3,
      totalUsers: 3,
    });
  });

  it('honors media type and user filters for generation counts but not activeUsers', async () => {
    const s = await model.summaryCounts({ ...RANGE, mediaType: 'video', userIds: [U1] });
    expect(s.generations).toBe(1);
    expect(s.success).toBe(1);
    expect(s.generatingUsers).toBe(1);
    expect(s.activeUsers).toBe(3);
  });

  it('counts signups inside the range', async () => {
    const s = await model.summaryCounts({ end: day('2026-01-06', 0), start: day('2026-01-01', 0) });
    expect(s.newSignups).toBe(2);
  });

  it('folds auth_sessions activity into activeUsers without a timezone shift', async () => {
    // U4 signed in only via an auth session inside RANGE; last_active_at and every
    // generation are well outside it, so this exercises the auth_sessions branch alone.
    // auth_sessions.created_at/updated_at are `timestamp without time zone`, so a naive
    // comparison against the timestamptz bounds gets reinterpreted through the current
    // session TimeZone by Postgres. Placing the session an hour before RANGE.end and
    // running under a non-UTC session TimeZone reproduces that shift: America/New_York
    // (UTC-5) pushes 2026-01-10T23:00 to 2026-01-11T04:00, past RANGE.end, so the buggy
    // comparison drops U4 from activeUsers. Pinning the comparison to UTC fixes it.
    const U4 = 'ur-user-4';
    await serverDB.insert(users).values({
      createdAt: day('2025-12-01'),
      email: 'four@example.com',
      id: U4,
      lastActiveAt: day('2025-12-01'),
    });
    await serverDB.insert(session).values({
      createdAt: day('2026-01-10', 23),
      expiresAt: day('2026-02-09'),
      id: 'sess-ur-user-4',
      token: 'token-ur-user-4',
      updatedAt: day('2026-01-10', 23),
      userId: U4,
    });

    await serverDB.execute(sql.raw(`SET TIME ZONE 'America/New_York'`));
    try {
      const s = await model.summaryCounts(RANGE);
      expect(s.activeUsers).toBe(4);
      expect(s.generatingUsers).toBe(2);
    } finally {
      await serverDB.execute(sql.raw(`SET TIME ZONE 'UTC'`));
    }
  });
});

describe('UsageReportModel series and breakdowns', () => {
  it('generationsByDay groups by UTC day, media type and outcome', async () => {
    const rows = await model.generationsByDay(RANGE);
    expect(rows).toEqual(
      expect.arrayContaining([
        { count: 1, day: '2026-01-08', mediaType: 'image', outcome: 'success' },
        { count: 1, day: '2026-01-09', mediaType: 'image', outcome: 'success' },
        { count: 1, day: '2026-01-09', mediaType: 'image', outcome: 'error' },
        { count: 1, day: '2026-01-09', mediaType: 'video', outcome: 'cancelled' },
        { count: 1, day: '2026-01-10', mediaType: 'video', outcome: 'success' },
        { count: 1, day: '2026-01-10', mediaType: 'image', outcome: 'active' },
      ]),
    );
    expect(rows).toHaveLength(6);
  });

  it('activeUsersByDay counts generating and any-activity users', async () => {
    const rows = await model.activeUsersByDay(RANGE);
    const byDay = Object.fromEntries(rows.map((r) => [r.day, r]));
    expect(byDay['2026-01-08']).toEqual({ activeUsers: 2, day: '2026-01-08', generatingUsers: 1 }); // U1 gen + U3 last_active
    expect(byDay['2026-01-09'].generatingUsers).toBe(2);
    expect(byDay['2026-01-10'].generatingUsers).toBe(2);
  });

  it('byUser aggregates per user with top model and fail counts', async () => {
    const rows = await model.byUser(RANGE);
    const u1 = rows.find((r) => r.userId === U1)!;
    expect(u1).toMatchObject({
      active: 0,
      cancelled: 0,
      email: 'one@example.com',
      error: 1,
      generations: 4,
      images: 3,
      name: 'One',
      success: 3,
      topModel: 'fal-ai/flux/schnell',
      videos: 1,
    });
    const u2 = rows.find((r) => r.userId === U2)!;
    expect(u2).toMatchObject({
      active: 1,
      cancelled: 1,
      error: 0,
      generations: 2,
      name: 'two',
      success: 0,
    });
    expect(rows.find((r) => r.userId === U3)).toBeUndefined();
  });

  it('byModel sorts by generations desc', async () => {
    const rows = await model.byModel(RANGE);
    expect(rows[0]).toEqual({
      error: 0,
      generations: 3,
      mediaType: 'image',
      model: 'fal-ai/flux/schnell',
      provider: 'fal',
      success: 2,
    });
    expect(rows.map((r) => r.model)).toEqual([
      'fal-ai/flux/schnell',
      'fal-ai/veo3.1',
      'fal-ai/nano-banana-2',
    ]);
  });

  it('costInputs returns success rows with megapixels and seconds', async () => {
    const rows = await model.costInputs(RANGE);
    expect(rows).toEqual(
      expect.arrayContaining([
        {
          megapixels: 2.097152,
          mediaType: 'image',
          model: 'fal-ai/flux/schnell',
          seconds: 0,
          successCount: 2,
          userId: U1,
        },
        {
          megapixels: 0,
          mediaType: 'video',
          model: 'fal-ai/veo3.1',
          seconds: 8,
          successCount: 1,
          userId: U1,
        },
      ]),
    );
    expect(rows.find((r) => r.userId === U2)).toBeUndefined(); // no successes in range
  });
});

describe('UsageReportModel failures and options', () => {
  it('failureReasons groups errors, excluding cancellations', async () => {
    const rows = await model.failureReasons(RANGE);
    expect(rows).toEqual([
      { count: 1, errorName: 'ProviderBizError', message: 'ProviderBizError happened' },
    ]);
  });

  it('recentFailures lists error rows newest first with user and prompt', async () => {
    const rows = await model.recentFailures(RANGE, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email: 'one@example.com',
      errorName: 'ProviderBizError',
      generationId: 'g3',
      mediaType: 'image',
      message: 'ProviderBizError happened',
      model: 'fal-ai/nano-banana-2',
      name: 'One',
      prompt: 'prompt for g3',
      userId: U1,
    });
  });

  it('filterOptions lists models and users seen in range', async () => {
    const o = await model.filterOptions(RANGE);
    expect(o.models.map((m) => m.model).sort()).toEqual([
      'fal-ai/flux/schnell',
      'fal-ai/nano-banana-2',
      'fal-ai/veo3.1',
    ]);
    expect(o.users.map((u) => u.userId).sort()).toEqual([U1, U2]);
  });
});
