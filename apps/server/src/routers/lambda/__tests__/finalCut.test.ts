import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AsyncTaskModel } from '@/database/models/asyncTask';
import { FileService } from '@/server/services/file';
import { FinalCutService } from '@/server/services/generation/finalCut';
import { AsyncTaskStatus, AsyncTaskType } from '@/types/asyncTask';

// Same hoisted-mock + createCaller style as voice.test.ts.
const {
  mockAssembleFinalCut,
  mockCheckTimeoutTasks,
  mockCreate,
  mockFindById,
  mockGetKeyFromFullUrl,
  mockUpdate,
} = vi.hoisted(() => ({
  mockAssembleFinalCut: vi.fn(),
  mockCheckTimeoutTasks: vi.fn().mockResolvedValue(undefined),
  mockCreate: vi.fn(),
  mockFindById: vi.fn(),
  mockGetKeyFromFullUrl: vi.fn(),
  mockUpdate: vi.fn().mockResolvedValue(undefined),
}));

// Capture (rather than auto-invoke) the after() callback so each test controls exactly when
// the background export "runs" and can await it deterministically.
let capturedAfterCallback: (() => Promise<void>) | null = null;

vi.mock('@/database/models/asyncTask');
vi.mock('@/server/services/file');
vi.mock('@/server/services/generation/finalCut');
vi.mock('@/database/core/db-adaptor', () => ({
  getServerDB: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/database/server', () => ({
  getServerDB: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/server/utils/scheduleAfterResponse', () => ({
  after: (cb: () => Promise<void>) => {
    capturedAfterCallback = cb;
  },
}));
vi.mock('debug', () => ({ default: vi.fn(() => vi.fn()) }));

const { finalCutRouter } = await import('../finalCut');

describe('finalCutRouter', () => {
  const mockCtx = { userId: 'test-user' };

  beforeEach(() => {
    vi.clearAllMocks();
    capturedAfterCallback = null;

    vi.mocked(AsyncTaskModel).mockImplementation(
      () =>
        ({
          checkTimeoutTasks: mockCheckTimeoutTasks,
          create: mockCreate,
          findById: mockFindById,
          update: mockUpdate,
        }) as any,
    );
    vi.mocked(FinalCutService).mockImplementation(
      () => ({ assembleFinalCut: mockAssembleFinalCut }) as any,
    );
    vi.mocked(FileService).mockImplementation(
      () => ({ getKeyFromFullUrl: mockGetKeyFromFullUrl }) as any,
    );
    // Default: every URL resolves to a stored key (the happy path). Individual SSRF tests
    // override this to return null for a specific URL to simulate one that isn't a real
    // object in this app's own storage.
    mockGetKeyFromFullUrl.mockImplementation(async (url: string) => `key:${url}`);
  });

  describe('create', () => {
    it('creates a pending async task and returns its id immediately', async () => {
      mockCreate.mockResolvedValue('task-1');

      const caller = finalCutRouter.createCaller(mockCtx);
      const result = await caller.create({
        audioUrl: 'https://f/voiceover.mp3',
        clipUrls: ['https://f/a.mp4', 'https://f/b.mp4'],
      });

      expect(result).toEqual({ taskId: 'task-1' });
      // Every URL is resolved against this app's own storage before the task is created.
      expect(mockGetKeyFromFullUrl).toHaveBeenCalledWith('https://f/a.mp4');
      expect(mockGetKeyFromFullUrl).toHaveBeenCalledWith('https://f/b.mp4');
      expect(mockGetKeyFromFullUrl).toHaveBeenCalledWith('https://f/voiceover.mp3');
      expect(mockCreate).toHaveBeenCalledWith({
        status: AsyncTaskStatus.Pending,
        type: AsyncTaskType.FinalCutExport,
      });
      // The ffmpeg work itself must not have run inline — it's deferred to after().
      expect(mockAssembleFinalCut).not.toHaveBeenCalled();
      expect(capturedAfterCallback).not.toBeNull();
    });

    it('rejects fewer than two clips', async () => {
      const caller = finalCutRouter.createCaller(mockCtx);
      await expect(caller.create({ clipUrls: ['https://f/a.mp4'] })).rejects.toThrow();
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('rejects more than twelve clips', async () => {
      const caller = finalCutRouter.createCaller(mockCtx);
      const clipUrls = Array.from({ length: 13 }, (_, i) => `https://f/${i}.mp4`);
      await expect(caller.create({ clipUrls })).rejects.toThrow();
    });

    it('rejects a clip URL that is not a file stored in this app, before creating any task or fetching anything (SSRF guard)', async () => {
      // https://f/a.mp4 resolves to a real key; https://169.254.169.254/latest/meta-data/
      // (a cloud metadata endpoint — a classic SSRF target) does not.
      mockGetKeyFromFullUrl.mockImplementation(async (url: string) =>
        url === 'https://169.254.169.254/latest/meta-data/' ? null : `key:${url}`,
      );

      const caller = finalCutRouter.createCaller(mockCtx);
      await expect(
        caller.create({
          clipUrls: ['https://f/a.mp4', 'https://169.254.169.254/latest/meta-data/'],
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

      // Rejected before the task was ever created, and the ffmpeg pipeline — which would
      // otherwise fetch that URL directly — must never run.
      expect(mockCreate).not.toHaveBeenCalled();
      expect(mockAssembleFinalCut).not.toHaveBeenCalled();
    });

    it('rejects an audioUrl that is not a file stored in this app, before creating any task (SSRF guard)', async () => {
      mockGetKeyFromFullUrl.mockImplementation(async (url: string) =>
        url === 'http://internal-admin.local/secrets' ? null : `key:${url}`,
      );

      const caller = finalCutRouter.createCaller(mockCtx);
      await expect(
        caller.create({
          audioUrl: 'http://internal-admin.local/secrets',
          clipUrls: ['https://f/a.mp4', 'https://f/b.mp4'],
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

      expect(mockCreate).not.toHaveBeenCalled();
      expect(mockAssembleFinalCut).not.toHaveBeenCalled();
    });

    it('marks the task Success with the result in its metadata once the background export finishes', async () => {
      mockCreate.mockResolvedValue('task-1');
      mockAssembleFinalCut.mockResolvedValue({
        durationSeconds: 12,
        fileId: 'file-1',
        url: 'https://app.example.com/f/final.mp4',
      });

      const caller = finalCutRouter.createCaller(mockCtx);
      await caller.create({ clipUrls: ['https://f/a.mp4', 'https://f/b.mp4'] });

      expect(capturedAfterCallback).not.toBeNull();
      await capturedAfterCallback!();

      // The service only ever receives resolved storage keys, never the raw client URLs.
      expect(mockAssembleFinalCut).toHaveBeenCalledWith(
        ['key:https://f/a.mp4', 'key:https://f/b.mp4'],
        undefined,
      );

      expect(mockUpdate).toHaveBeenNthCalledWith(1, 'task-1', {
        status: AsyncTaskStatus.Processing,
      });
      expect(mockUpdate).toHaveBeenNthCalledWith(2, 'task-1', {
        metadata: {
          durationSeconds: 12,
          fileId: 'file-1',
          url: 'https://app.example.com/f/final.mp4',
        },
        status: AsyncTaskStatus.Success,
      });
    });

    it('marks the task Error when the background export throws', async () => {
      mockCreate.mockResolvedValue('task-1');
      mockAssembleFinalCut.mockRejectedValue(new Error('ffmpeg exited with code 1'));

      const caller = finalCutRouter.createCaller(mockCtx);
      await caller.create({ clipUrls: ['https://f/a.mp4', 'https://f/b.mp4'] });

      await capturedAfterCallback!();

      expect(mockUpdate).toHaveBeenNthCalledWith(2, 'task-1', {
        error: expect.objectContaining({
          body: { detail: 'ffmpeg exited with code 1' },
        }),
        status: AsyncTaskStatus.Error,
      });
    });
  });

  describe('status', () => {
    it('returns the result url once the task has succeeded', async () => {
      mockFindById.mockResolvedValue({
        error: null,
        id: 'task-1',
        metadata: { durationSeconds: 12, fileId: 'file-1', url: 'https://f/final.mp4' },
        status: AsyncTaskStatus.Success,
      });

      const caller = finalCutRouter.createCaller(mockCtx);
      const result = await caller.status({ taskId: 'task-1' });

      expect(result).toEqual({
        durationSeconds: 12,
        error: null,
        status: AsyncTaskStatus.Success,
        url: 'https://f/final.mp4',
      });
      expect(mockCheckTimeoutTasks).toHaveBeenCalledWith(['task-1']);
    });

    it('surfaces the stored error once the task has failed', async () => {
      const taskError = { body: { detail: 'boom' }, name: 'ServerError' };
      mockFindById.mockResolvedValue({
        error: taskError,
        id: 'task-1',
        metadata: {},
        status: AsyncTaskStatus.Error,
      });

      const caller = finalCutRouter.createCaller(mockCtx);
      const result = await caller.status({ taskId: 'task-1' });

      expect(result.status).toBe(AsyncTaskStatus.Error);
      expect(result.error).toEqual(taskError);
      expect(result.url).toBeUndefined();
    });

    it('throws NOT_FOUND for an unknown task', async () => {
      mockFindById.mockResolvedValue(undefined);

      const caller = finalCutRouter.createCaller(mockCtx);
      await expect(caller.status({ taskId: 'missing' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });
});
