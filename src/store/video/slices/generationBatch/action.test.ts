import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { generationService } from '@/services/generation';
import { generationBatchService } from '@/services/generationBatch';
import { useVideoStore } from '@/store/video';
import { AsyncTaskStatus } from '@/types/asyncTask';
import { type GenerationBatch } from '@/types/generation';

vi.mock('@/services/generation', () => ({
  generationService: {
    cancelGeneration: vi.fn(),
    deleteGeneration: vi.fn(),
    getGenerationStatus: vi.fn(),
  },
}));

vi.mock('@/services/generationBatch', () => ({
  generationBatchService: {
    deleteGenerationBatch: vi.fn(),
    getGenerationBatches: vi.fn(),
    setBatchApprovalStatus: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  useVideoStore.setState({
    generationBatchesMap: {},
    activeGenerationTopicId: null,
  });
});

describe('GenerationBatchAction', () => {
  describe('setBatchApprovalStatus', () => {
    it('should optimistically update the batch then persist and refresh', async () => {
      const topicId = 'gt_topic_1';
      const batchId = 'gb_batch_1';
      useVideoStore.setState({ activeGenerationTopicId: topicId });

      const { result } = renderHook(() => useVideoStore());

      const dispatchSpy = vi.spyOn(result.current, 'internal_dispatchGenerationBatch');
      const refreshSpy = vi.spyOn(result.current, 'refreshGenerationBatches').mockResolvedValue();

      await act(async () => {
        await result.current.setBatchApprovalStatus(batchId, 'changesRequested');
      });

      expect(dispatchSpy).toHaveBeenCalledWith(
        topicId,
        { id: batchId, type: 'updateBatch', value: { approvalStatus: 'changesRequested' } },
        'setBatchApprovalStatus',
      );
      expect(generationBatchService.setBatchApprovalStatus).toHaveBeenCalledWith(
        batchId,
        'changesRequested',
      );
      expect(refreshSpy).toHaveBeenCalled();
    });

    it('should do nothing without an active topic', async () => {
      const { result } = renderHook(() => useVideoStore());

      await act(async () => {
        await result.current.setBatchApprovalStatus('gb_batch_1', 'approved');
      });

      expect(generationBatchService.setBatchApprovalStatus).not.toHaveBeenCalled();
    });
  });

  describe('cancelGeneration', () => {
    it('persists the cancel then flips the generation to Error, halting polling', async () => {
      const topicId = 'gt_topic_1';
      const batchId = 'gb_batch_1';
      const generationId = 'gen_1';
      const asyncTaskId = 'task_1';

      const batches: GenerationBatch[] = [
        {
          id: batchId,
          provider: 'fal',
          model: 'veo-3.1',
          prompt: 'Test prompt',
          createdAt: new Date(),
          generations: [
            {
              id: generationId,
              seed: null,
              createdAt: new Date(),
              asyncTaskId,
              task: { id: asyncTaskId, status: AsyncTaskStatus.Processing },
            },
          ],
        },
      ];

      act(() => {
        useVideoStore.setState({
          activeGenerationTopicId: topicId,
          generationBatchesMap: { [topicId]: batches },
        });
      });

      vi.mocked(generationService.cancelGeneration).mockResolvedValue({
        error: { body: { detail: 'Generation cancelled' }, name: 'TaskCancelled' },
        generation: null,
        status: AsyncTaskStatus.Error,
      } as any);

      const { result } = renderHook(() => useVideoStore());

      await act(async () => {
        await result.current.cancelGeneration(generationId, asyncTaskId);
      });

      expect(generationService.cancelGeneration).toHaveBeenCalledWith(generationId, asyncTaskId);

      const updatedGeneration =
        useVideoStore.getState().generationBatchesMap[topicId][0].generations[0];
      expect(updatedGeneration.task.status).toBe(AsyncTaskStatus.Error);
      expect(updatedGeneration.task.error?.name).toBe('TaskCancelled');
    });

    it('does nothing without an active topic', async () => {
      const { result } = renderHook(() => useVideoStore());

      await act(async () => {
        await result.current.cancelGeneration('gen_1', 'task_1');
      });

      expect(generationService.cancelGeneration).not.toHaveBeenCalled();
    });
  });
});
