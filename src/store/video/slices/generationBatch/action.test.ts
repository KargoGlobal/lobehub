import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { generationBatchService } from '@/services/generationBatch';
import { useVideoStore } from '@/store/video';

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
});
