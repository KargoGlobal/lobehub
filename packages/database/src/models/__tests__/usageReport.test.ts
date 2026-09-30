// @vitest-environment node
import { AsyncTaskStatus, AsyncTaskType } from '@lobechat/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { asyncTasks, generationBatches, generations, generationTopics, users } from '../../schemas';
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
});
