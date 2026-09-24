import { TRPCError } from '@trpc/server';
import { describe, expect, it, vi } from 'vitest';

import { AsyncTaskModel } from '@/database/models/asyncTask';
import { GenerationModel } from '@/database/models/generation';
import { FileService } from '@/server/services/file';
import { rescueStuckVideoTask } from '@/server/services/generation/videoBackgroundPolling';
import { AsyncTaskErrorType, AsyncTaskStatus, AsyncTaskType } from '@/types/asyncTask';

import { generationRouter } from '../generation';

vi.mock('@/database/models/asyncTask');
vi.mock('@/database/models/generation');
vi.mock('@/server/services/file');
vi.mock('@/server/services/generation/videoBackgroundPolling', () => ({
  rescueStuckVideoTask: vi.fn().mockResolvedValue(false),
}));
const { mockServerDB } = vi.hoisted(() => ({
  mockServerDB: { query: { generationBatches: { findFirst: vi.fn() } } },
}));
vi.mock('@/database/core/db-adaptor', () => ({
  getServerDB: vi.fn().mockResolvedValue(mockServerDB),
}));

describe('generationRouter', () => {
  const mockCtx = {
    userId: 'test-user',
  };

  describe('getGenerationStatus', () => {
    it('asks the provider about a video task still processing before the timeout sweep', async () => {
      const stuckTask = {
        createdAt: new Date('2026-09-14T01:19:47Z'),
        id: 'task-1',
        inferenceId: 'fal-ai/veo3.1::req-1',
        status: AsyncTaskStatus.Processing,
        type: AsyncTaskType.VideoGeneration,
      };
      const rescuedTask = { ...stuckTask, status: AsyncTaskStatus.Success };
      const mockFindById = vi
        .fn()
        .mockResolvedValueOnce(stuckTask) // pre-rescue peek
        .mockResolvedValueOnce(rescuedTask); // after rescue
      const mockCheckTimeoutTasks = vi.fn().mockResolvedValue(undefined);
      const mockGeneration = { id: 'gen-1', asset: { url: 'https://example.com/v.mp4' } };

      vi.mocked(AsyncTaskModel).mockImplementation(
        () => ({ checkTimeoutTasks: mockCheckTimeoutTasks, findById: mockFindById }) as any,
      );
      vi.mocked(GenerationModel).mockImplementation(
        () =>
          ({
            findById: vi.fn().mockResolvedValue({ generationBatchId: 'batch-1', id: 'gen-1' }),
            findByIdAndTransform: vi.fn().mockResolvedValue(mockGeneration),
          }) as any,
      );
      vi.mocked(rescueStuckVideoTask).mockResolvedValueOnce(true);

      mockServerDB.query.generationBatches.findFirst.mockResolvedValue({
        id: 'batch-1',
        provider: 'fal',
      });
      const caller = generationRouter.createCaller(mockCtx);
      const result = await caller.getGenerationStatus({
        asyncTaskId: 'task-1',
        generationId: 'gen-1',
      });

      expect(rescueStuckVideoTask).toHaveBeenCalledWith(
        mockServerDB,
        expect.objectContaining({
          asyncTaskId: 'task-1',
          generationBatchId: 'batch-1',
          generationId: 'gen-1',
          inferenceId: 'fal-ai/veo3.1::req-1',
          provider: 'fal',
        }),
      );
      // Rescue runs first, so the timeout sweep cannot write the task off as failed.
      expect(vi.mocked(rescueStuckVideoTask).mock.invocationCallOrder[0]).toBeLessThan(
        mockCheckTimeoutTasks.mock.invocationCallOrder[0],
      );
      expect(result.status).toBe(AsyncTaskStatus.Success);
      expect(result.generation).toEqual(mockGeneration);
    });

    it('should return generation status when task is successful', async () => {
      const mockGeneration = {
        id: 'gen-1',
        asset: { url: 'https://example.com/image.jpg' },
      };
      const mockAsyncTask = {
        id: 'task-1',
        status: AsyncTaskStatus.Success,
        error: null,
      };
      const mockCheckTimeoutTasks = vi.fn().mockResolvedValue(undefined);
      const mockFindById = vi.fn().mockResolvedValue(mockAsyncTask);
      const mockFindByIdAndTransform = vi.fn().mockResolvedValue(mockGeneration);

      vi.mocked(AsyncTaskModel).mockImplementation(
        () =>
          ({
            checkTimeoutTasks: mockCheckTimeoutTasks,
            findById: mockFindById,
          }) as any,
      );
      vi.mocked(GenerationModel).mockImplementation(
        () =>
          ({
            findByIdAndTransform: mockFindByIdAndTransform,
          }) as any,
      );

      const caller = generationRouter.createCaller(mockCtx);

      const result = await caller.getGenerationStatus({
        generationId: 'gen-1',
        asyncTaskId: 'task-1',
      });

      expect(result.status).toBe(AsyncTaskStatus.Success);
      expect(result.generation).toEqual(mockGeneration);
      expect(result.error).toBeNull();
      expect(mockCheckTimeoutTasks).toHaveBeenCalledWith(['task-1']);
      expect(mockFindById).toHaveBeenCalledWith('task-1');
      expect(mockFindByIdAndTransform).toHaveBeenCalledWith('gen-1');
    });

    it('should return error when task failed', async () => {
      const mockError = { code: 'GENERATION_ERROR', message: 'Generation failed' };
      const mockAsyncTask = {
        id: 'task-1',
        status: AsyncTaskStatus.Error,
        error: mockError,
      };
      const mockCheckTimeoutTasks = vi.fn().mockResolvedValue(undefined);
      const mockFindById = vi.fn().mockResolvedValue(mockAsyncTask);

      vi.mocked(AsyncTaskModel).mockImplementation(
        () =>
          ({
            checkTimeoutTasks: mockCheckTimeoutTasks,
            findById: mockFindById,
          }) as any,
      );

      const caller = generationRouter.createCaller(mockCtx);

      const result = await caller.getGenerationStatus({
        generationId: 'gen-1',
        asyncTaskId: 'task-1',
      });

      expect(result.status).toBe(AsyncTaskStatus.Error);
      expect(result.generation).toBeNull();
      expect(result.error).toEqual(mockError);
    });

    it('should return pending status when task is running', async () => {
      const mockAsyncTask = {
        id: 'task-1',
        status: AsyncTaskStatus.Pending,
        error: null,
      };
      const mockCheckTimeoutTasks = vi.fn().mockResolvedValue(undefined);
      const mockFindById = vi.fn().mockResolvedValue(mockAsyncTask);

      vi.mocked(AsyncTaskModel).mockImplementation(
        () =>
          ({
            checkTimeoutTasks: mockCheckTimeoutTasks,
            findById: mockFindById,
          }) as any,
      );

      const caller = generationRouter.createCaller(mockCtx);

      const result = await caller.getGenerationStatus({
        generationId: 'gen-1',
        asyncTaskId: 'task-1',
      });

      expect(result.status).toBe(AsyncTaskStatus.Pending);
      expect(result.generation).toBeNull();
      expect(result.error).toBeNull();
    });

    it('should throw error when async task not found', async () => {
      const mockCheckTimeoutTasks = vi.fn().mockResolvedValue(undefined);
      const mockFindById = vi.fn().mockResolvedValue(null);

      vi.mocked(AsyncTaskModel).mockImplementation(
        () =>
          ({
            checkTimeoutTasks: mockCheckTimeoutTasks,
            findById: mockFindById,
          }) as any,
      );

      const caller = generationRouter.createCaller(mockCtx);

      await expect(
        caller.getGenerationStatus({
          generationId: 'gen-1',
          asyncTaskId: 'task-1',
        }),
      ).rejects.toThrow(TRPCError);
    });

    it('should throw error when generation not found for successful task', async () => {
      const mockAsyncTask = {
        id: 'task-1',
        status: AsyncTaskStatus.Success,
        error: null,
      };
      const mockCheckTimeoutTasks = vi.fn().mockResolvedValue(undefined);
      const mockFindById = vi.fn().mockResolvedValue(mockAsyncTask);
      const mockFindByIdAndTransform = vi.fn().mockResolvedValue(null);

      vi.mocked(AsyncTaskModel).mockImplementation(
        () =>
          ({
            checkTimeoutTasks: mockCheckTimeoutTasks,
            findById: mockFindById,
          }) as any,
      );
      vi.mocked(GenerationModel).mockImplementation(
        () =>
          ({
            findByIdAndTransform: mockFindByIdAndTransform,
          }) as any,
      );

      const caller = generationRouter.createCaller(mockCtx);

      await expect(
        caller.getGenerationStatus({
          generationId: 'gen-1',
          asyncTaskId: 'task-1',
        }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('deleteGeneration', () => {
    it('should delete generation with thumbnail', async () => {
      const mockDeletedGeneration = {
        id: 'gen-1',
        asset: { thumbnailUrl: 'thumb-key' },
      };
      const mockDelete = vi.fn().mockResolvedValue(mockDeletedGeneration);
      const mockDeleteFile = vi.fn().mockResolvedValue(true);
      const mockGenerationFindById = vi
        .fn()
        .mockResolvedValue({ ...mockDeletedGeneration, userId: 'test-user' });

      vi.mocked(GenerationModel).mockImplementation(
        () =>
          ({
            delete: mockDelete,
            findById: mockGenerationFindById,
          }) as any,
      );
      vi.mocked(FileService).mockImplementation(
        () =>
          ({
            deleteFile: mockDeleteFile,
          }) as any,
      );

      const caller = generationRouter.createCaller(mockCtx);

      const result = await caller.deleteGeneration({ generationId: 'gen-1' });

      expect(result).toEqual(mockDeletedGeneration);
      expect(mockDelete).toHaveBeenCalledWith('gen-1');
      expect(mockDeleteFile).toHaveBeenCalledWith('thumb-key');
    });

    it('should delete generation without thumbnail', async () => {
      const mockDeletedGeneration = {
        id: 'gen-1',
        asset: { url: 'main-url' },
      };
      const mockDelete = vi.fn().mockResolvedValue(mockDeletedGeneration);
      const mockDeleteFile = vi.fn().mockResolvedValue(true);
      const mockGenerationFindById = vi
        .fn()
        .mockResolvedValue({ ...mockDeletedGeneration, userId: 'test-user' });

      vi.mocked(GenerationModel).mockImplementation(
        () =>
          ({
            delete: mockDelete,
            findById: mockGenerationFindById,
          }) as any,
      );
      vi.mocked(FileService).mockImplementation(
        () =>
          ({
            deleteFile: mockDeleteFile,
          }) as any,
      );

      const caller = generationRouter.createCaller(mockCtx);

      const result = await caller.deleteGeneration({ generationId: 'gen-1' });

      expect(result).toEqual(mockDeletedGeneration);
      expect(mockDelete).toHaveBeenCalledWith('gen-1');
      expect(mockDeleteFile).not.toHaveBeenCalled();
    });

    it('should handle when generation not found', async () => {
      const mockDelete = vi.fn().mockResolvedValue(null);
      const mockDeleteFile = vi.fn().mockResolvedValue(true);
      const mockGenerationFindById = vi.fn().mockResolvedValue(undefined);

      vi.mocked(GenerationModel).mockImplementation(
        () =>
          ({
            delete: mockDelete,
            findById: mockGenerationFindById,
          }) as any,
      );
      vi.mocked(FileService).mockImplementation(
        () =>
          ({
            deleteFile: mockDeleteFile,
          }) as any,
      );

      const caller = generationRouter.createCaller(mockCtx);

      const result = await caller.deleteGeneration({ generationId: 'gen-1' });

      expect(result).toBeUndefined();
      expect(mockDelete).not.toHaveBeenCalled();
      expect(mockDeleteFile).not.toHaveBeenCalled();
    });
  });

  describe('cancelGeneration', () => {
    it('marks a Pending task Error with a cancelled reason and stops there (no fal abort)', async () => {
      const mockAsyncTaskFindById = vi.fn().mockResolvedValue({
        id: 'task-1',
        status: AsyncTaskStatus.Pending,
      });
      const mockUpdateIfActive = vi.fn().mockResolvedValue(true);
      const mockGenerationFindById = vi
        .fn()
        .mockResolvedValue({ id: 'gen-1', userId: 'test-user' });

      vi.mocked(AsyncTaskModel).mockImplementation(
        () => ({ findById: mockAsyncTaskFindById, updateIfActive: mockUpdateIfActive }) as any,
      );
      vi.mocked(GenerationModel).mockImplementation(
        () => ({ findById: mockGenerationFindById }) as any,
      );

      const caller = generationRouter.createCaller(mockCtx);
      const result = await caller.cancelGeneration({
        asyncTaskId: 'task-1',
        generationId: 'gen-1',
      });

      expect(mockUpdateIfActive).toHaveBeenCalledWith(
        'task-1',
        expect.objectContaining({
          status: AsyncTaskStatus.Error,
          error: expect.objectContaining({ name: AsyncTaskErrorType.TaskCancelled }),
        }),
      );
      expect(result.status).toBe(AsyncTaskStatus.Error);
      expect(result.error?.name).toBe(AsyncTaskErrorType.TaskCancelled);
      expect(result.generation).toBeNull();
    });

    it('cancels a Processing task the same way as Pending', async () => {
      const mockAsyncTaskFindById = vi.fn().mockResolvedValue({
        id: 'task-1',
        status: AsyncTaskStatus.Processing,
      });
      const mockUpdateIfActive = vi.fn().mockResolvedValue(true);

      vi.mocked(AsyncTaskModel).mockImplementation(
        () => ({ findById: mockAsyncTaskFindById, updateIfActive: mockUpdateIfActive }) as any,
      );
      vi.mocked(GenerationModel).mockImplementation(
        () =>
          ({ findById: vi.fn().mockResolvedValue({ id: 'gen-1', userId: 'test-user' }) }) as any,
      );

      const caller = generationRouter.createCaller(mockCtx);
      const result = await caller.cancelGeneration({
        asyncTaskId: 'task-1',
        generationId: 'gen-1',
      });

      expect(mockUpdateIfActive).toHaveBeenCalledTimes(1);
      expect(result.status).toBe(AsyncTaskStatus.Error);
    });

    it('does not clobber a task that already finished — TOCTOU guard via updateIfActive', async () => {
      // The task raced ahead to Success between this request's existence
      // check and its write: updateIfActive's WHERE-guarded UPDATE finds it
      // no longer Pending/Processing and applies nothing.
      const successTask = { id: 'task-1', status: AsyncTaskStatus.Success, error: null };
      const mockAsyncTaskFindById = vi.fn().mockResolvedValue(successTask);
      const mockUpdateIfActive = vi.fn().mockResolvedValue(false);
      const mockGeneration = { id: 'gen-1', asset: { url: 'https://example.com/image.jpg' } };
      const mockFindByIdAndTransform = vi.fn().mockResolvedValue(mockGeneration);

      vi.mocked(AsyncTaskModel).mockImplementation(
        () => ({ findById: mockAsyncTaskFindById, updateIfActive: mockUpdateIfActive }) as any,
      );
      vi.mocked(GenerationModel).mockImplementation(
        () =>
          ({
            findById: vi.fn().mockResolvedValue({ id: 'gen-1', userId: 'test-user' }),
            findByIdAndTransform: mockFindByIdAndTransform,
          }) as any,
      );

      const caller = generationRouter.createCaller(mockCtx);
      const result = await caller.cancelGeneration({
        asyncTaskId: 'task-1',
        generationId: 'gen-1',
      });

      // The cancel was attempted (guarded), but the guard reported it did
      // not apply — the Success status (and its asset) survive intact.
      expect(mockUpdateIfActive).toHaveBeenCalledWith(
        'task-1',
        expect.objectContaining({
          status: AsyncTaskStatus.Error,
          error: expect.objectContaining({ name: AsyncTaskErrorType.TaskCancelled }),
        }),
      );
      expect(result.status).toBe(AsyncTaskStatus.Success);
      expect(result.error).toBeNull();
      expect(result.generation).toEqual(mockGeneration);
    });

    it('reports an already-cancelled task as still cancelled (idempotent, no double error write)', async () => {
      const cancelledTask = {
        id: 'task-1',
        status: AsyncTaskStatus.Error,
        error: { body: { detail: 'Generation cancelled' }, name: AsyncTaskErrorType.TaskCancelled },
      };
      const mockAsyncTaskFindById = vi.fn().mockResolvedValue(cancelledTask);
      const mockUpdateIfActive = vi.fn().mockResolvedValue(false);

      vi.mocked(AsyncTaskModel).mockImplementation(
        () => ({ findById: mockAsyncTaskFindById, updateIfActive: mockUpdateIfActive }) as any,
      );
      vi.mocked(GenerationModel).mockImplementation(
        () =>
          ({ findById: vi.fn().mockResolvedValue({ id: 'gen-1', userId: 'test-user' }) }) as any,
      );

      const caller = generationRouter.createCaller(mockCtx);
      const result = await caller.cancelGeneration({
        asyncTaskId: 'task-1',
        generationId: 'gen-1',
      });

      expect(result.status).toBe(AsyncTaskStatus.Error);
      expect(result.error?.name).toBe(AsyncTaskErrorType.TaskCancelled);
      expect(result.generation).toBeNull();
    });

    it('throws NOT_FOUND when the generation does not exist', async () => {
      vi.mocked(GenerationModel).mockImplementation(
        () => ({ findById: vi.fn().mockResolvedValue(undefined) }) as any,
      );

      const caller = generationRouter.createCaller(mockCtx);

      await expect(
        caller.cancelGeneration({ asyncTaskId: 'task-1', generationId: 'missing-gen' }),
      ).rejects.toThrow(TRPCError);
    });

    it('throws NOT_FOUND when the async task does not exist', async () => {
      vi.mocked(GenerationModel).mockImplementation(
        () =>
          ({ findById: vi.fn().mockResolvedValue({ id: 'gen-1', userId: 'test-user' }) }) as any,
      );
      vi.mocked(AsyncTaskModel).mockImplementation(
        () => ({ findById: vi.fn().mockResolvedValue(undefined) }) as any,
      );

      const caller = generationRouter.createCaller(mockCtx);

      await expect(
        caller.cancelGeneration({ asyncTaskId: 'missing-task', generationId: 'gen-1' }),
      ).rejects.toThrow(TRPCError);
    });
  });
});
