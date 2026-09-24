import { describe, expect, it, vi } from 'vitest';

import { GenerationBatchModel } from '@/database/models/generationBatch';
import { type GenerationBatchItem } from '@/database/schemas/generation';
import { FileService } from '@/server/services/file';
import { getGenerationAvgLatency } from '@/server/services/generation/latency';

import { generationBatchRouter } from '../generationBatch';

vi.mock('@/database/models/generationBatch');
vi.mock('@/server/services/file');
vi.mock('@/server/services/generation/latency');

describe('generationBatchRouter', () => {
  const mockCtx = {
    userId: 'test-user',
    serverDB: {} as any,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should get generation batches by topic id', async () => {
    const mockBatches = [
      {
        id: 'batch-1',
        topicId: 'topic-1',
        prompt: 'Test prompt',
        generations: [
          { id: 'gen-1', batchId: 'batch-1' },
          { id: 'gen-2', batchId: 'batch-1' },
        ],
      },
      {
        id: 'batch-2',
        topicId: 'topic-1',
        prompt: 'Another prompt',
        generations: [{ id: 'gen-3', batchId: 'batch-2' }],
      },
    ];

    const mockQuery = vi.fn().mockResolvedValue(mockBatches);
    vi.mocked(GenerationBatchModel).mockImplementation(
      () =>
        ({
          queryGenerationBatchesByTopicIdWithGenerations: mockQuery,
        }) as any,
    );

    const caller = generationBatchRouter.createCaller(mockCtx);

    const result = await caller.getGenerationBatches({ topicId: 'topic-1' });

    expect(result).toEqual(mockBatches);
    expect(mockQuery).toHaveBeenCalledWith('topic-1');
  });

  it('should delete generation batch without thumbnails', async () => {
    const mockBatchId = 'batch-123';
    const mockDeletedBatch: GenerationBatchItem = {
      id: mockBatchId,
      userId: 'test-user',
      workspaceId: null,
      generationTopicId: 'topic-1',
      approvalStatus: 'pending',
      provider: 'test-provider',
      model: 'test-model',
      prompt: 'Test prompt',
      width: 1024,
      height: 1024,
      ratio: null,
      config: null,
      accessedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockDelete = vi.fn().mockResolvedValue({
      deletedBatch: mockDeletedBatch,
      filesToDelete: [], // no thumbnails
    });
    const mockDeleteFiles = vi.fn();

    vi.mocked(GenerationBatchModel).mockImplementation(
      () =>
        ({
          delete: mockDelete,
          findById: vi.fn().mockResolvedValue(mockDeletedBatch),
        }) as any,
    );

    vi.mocked(FileService).mockImplementation(
      () =>
        ({
          deleteFiles: mockDeleteFiles,
        }) as any,
    );

    const caller = generationBatchRouter.createCaller(mockCtx);
    const result = await caller.deleteGenerationBatch({ batchId: mockBatchId });

    expect(result).toEqual(mockDeletedBatch);
    expect(mockDelete).toHaveBeenCalledWith(mockBatchId);
    expect(mockDeleteFiles).not.toHaveBeenCalled(); // no files to delete
  });

  it('should delete generation batch with thumbnails', async () => {
    const mockBatchId = 'batch-123';
    const mockThumbnailUrls = ['thumb1.jpg', 'thumb2.jpg', 'thumb3.jpg'];
    const mockDeletedBatch: GenerationBatchItem = {
      id: mockBatchId,
      userId: 'test-user',
      workspaceId: null,
      generationTopicId: 'topic-1',
      approvalStatus: 'pending',
      provider: 'test-provider',
      model: 'test-model',
      prompt: 'Test prompt',
      width: 1024,
      height: 1024,
      ratio: null,
      config: null,
      accessedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockDelete = vi.fn().mockResolvedValue({
      deletedBatch: mockDeletedBatch,
      filesToDelete: mockThumbnailUrls,
    });
    const mockDeleteFiles = vi.fn().mockResolvedValue(true);

    vi.mocked(GenerationBatchModel).mockImplementation(
      () =>
        ({
          delete: mockDelete,
          findById: vi.fn().mockResolvedValue(mockDeletedBatch),
        }) as any,
    );

    vi.mocked(FileService).mockImplementation(
      () =>
        ({
          deleteFiles: mockDeleteFiles,
        }) as any,
    );

    const caller = generationBatchRouter.createCaller(mockCtx);
    const result = await caller.deleteGenerationBatch({ batchId: mockBatchId });

    expect(result).toEqual(mockDeletedBatch);
    expect(mockDelete).toHaveBeenCalledWith(mockBatchId);
    expect(mockDeleteFiles).toHaveBeenCalledWith(mockThumbnailUrls);
  });

  it('should still return deleted batch when thumbnail deletion fails', async () => {
    const mockBatchId = 'batch-123';
    const mockThumbnailUrls = ['thumb1.jpg', 'thumb2.jpg'];
    const mockDeletedBatch: GenerationBatchItem = {
      id: mockBatchId,
      userId: 'test-user',
      workspaceId: null,
      generationTopicId: 'topic-1',
      approvalStatus: 'pending',
      provider: 'test-provider',
      model: 'test-model',
      prompt: 'Test prompt',
      width: 1024,
      height: 1024,
      ratio: null,
      config: null,
      accessedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockDelete = vi.fn().mockResolvedValue({
      deletedBatch: mockDeletedBatch,
      filesToDelete: mockThumbnailUrls,
    });

    // Mock thumbnail deletion to fail
    const mockDeleteFiles = vi.fn().mockRejectedValue(new Error('S3 thumbnail deletion failed'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.mocked(GenerationBatchModel).mockImplementation(
      () =>
        ({
          delete: mockDelete,
          findById: vi.fn().mockResolvedValue(mockDeletedBatch),
        }) as any,
    );

    vi.mocked(FileService).mockImplementation(
      () =>
        ({
          deleteFiles: mockDeleteFiles,
        }) as any,
    );

    const caller = generationBatchRouter.createCaller(mockCtx);
    const result = await caller.deleteGenerationBatch({ batchId: mockBatchId });

    // Database deletion should succeed even if thumbnail deletion fails
    expect(result).toEqual(mockDeletedBatch);
    expect(mockDelete).toHaveBeenCalledWith(mockBatchId);
    expect(mockDeleteFiles).toHaveBeenCalledWith(mockThumbnailUrls);
    expect(consoleSpy).toHaveBeenCalledWith('Failed to delete files from S3:', expect.any(Error));

    consoleSpy.mockRestore();
  });

  it('should return undefined when deleting non-existent batch', async () => {
    const mockBatchId = 'non-existent-batch';

    const mockDelete = vi.fn().mockResolvedValue(undefined);
    const mockDeleteFiles = vi.fn();

    vi.mocked(GenerationBatchModel).mockImplementation(
      () =>
        ({
          delete: mockDelete,
          findById: vi.fn().mockResolvedValue(undefined),
        }) as any,
    );

    vi.mocked(FileService).mockImplementation(
      () =>
        ({
          deleteFiles: mockDeleteFiles,
        }) as any,
    );

    const caller = generationBatchRouter.createCaller(mockCtx);
    const result = await caller.deleteGenerationBatch({ batchId: mockBatchId });

    expect(result).toBeUndefined();
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockDeleteFiles).not.toHaveBeenCalled(); // no files to delete
  });

  it('should handle large number of thumbnails deletion', async () => {
    const mockBatchId = 'batch-with-many-thumbnails';
    // Simulate a batch with many thumbnails
    const mockThumbnailUrls = Array.from({ length: 50 }, (_, i) => `thumb${i + 1}.jpg`);
    const mockDeletedBatch: GenerationBatchItem = {
      id: mockBatchId,
      userId: 'test-user',
      workspaceId: null,
      generationTopicId: 'topic-1',
      approvalStatus: 'pending',
      provider: 'test-provider',
      model: 'test-model',
      prompt: 'Batch with many generations',
      width: 1024,
      height: 1024,
      ratio: null,
      config: null,
      accessedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockDelete = vi.fn().mockResolvedValue({
      deletedBatch: mockDeletedBatch,
      filesToDelete: mockThumbnailUrls,
    });
    const mockDeleteFiles = vi.fn().mockResolvedValue(true);

    vi.mocked(GenerationBatchModel).mockImplementation(
      () =>
        ({
          delete: mockDelete,
          findById: vi.fn().mockResolvedValue(mockDeletedBatch),
        }) as any,
    );

    vi.mocked(FileService).mockImplementation(
      () =>
        ({
          deleteFiles: mockDeleteFiles,
        }) as any,
    );

    const caller = generationBatchRouter.createCaller(mockCtx);
    const result = await caller.deleteGenerationBatch({ batchId: mockBatchId });

    expect(result).toEqual(mockDeletedBatch);
    expect(mockDelete).toHaveBeenCalledWith(mockBatchId);
    expect(mockDeleteFiles).toHaveBeenCalledWith(mockThumbnailUrls);
    expect(mockDeleteFiles).toHaveBeenCalledTimes(1);
  });

  it('should handle empty generation batches result', async () => {
    const mockQuery = vi.fn().mockResolvedValue([]);
    vi.mocked(GenerationBatchModel).mockImplementation(
      () =>
        ({
          queryGenerationBatchesByTopicIdWithGenerations: mockQuery,
        }) as any,
    );

    const caller = generationBatchRouter.createCaller(mockCtx);

    const result = await caller.getGenerationBatches({ topicId: 'non-existent-topic' });

    expect(result).toEqual([]);
    expect(mockQuery).toHaveBeenCalledWith('non-existent-topic');
  });

  it('should handle query error gracefully', async () => {
    const mockQuery = vi.fn().mockRejectedValue(new Error('Database connection failed'));
    vi.mocked(GenerationBatchModel).mockImplementation(
      () =>
        ({
          queryGenerationBatchesByTopicIdWithGenerations: mockQuery,
        }) as any,
    );

    const caller = generationBatchRouter.createCaller(mockCtx);

    await expect(caller.getGenerationBatches({ topicId: 'topic-1' })).rejects.toThrow(
      'Database connection failed',
    );
    expect(mockQuery).toHaveBeenCalledWith('topic-1');
  });

  it('should handle partial thumbnail deletion failure gracefully', async () => {
    const mockBatchId = 'batch-123';
    const mockThumbnailUrls = ['thumb1.jpg', 'thumb2.jpg', 'thumb3.jpg'];
    const mockDeletedBatch: GenerationBatchItem = {
      id: mockBatchId,
      userId: 'test-user',
      workspaceId: null,
      generationTopicId: 'topic-1',
      approvalStatus: 'pending',
      provider: 'test-provider',
      model: 'test-model',
      prompt: 'Test prompt',
      width: 1024,
      height: 1024,
      ratio: null,
      config: null,
      accessedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockDelete = vi.fn().mockResolvedValue({
      deletedBatch: mockDeletedBatch,
      filesToDelete: mockThumbnailUrls,
    });

    // Mock partial failure - some thumbnails could not be deleted
    const mockDeleteFiles = vi
      .fn()
      .mockRejectedValue(new Error('Some thumbnails could not be deleted from S3'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.mocked(GenerationBatchModel).mockImplementation(
      () =>
        ({
          delete: mockDelete,
          findById: vi.fn().mockResolvedValue(mockDeletedBatch),
        }) as any,
    );

    vi.mocked(FileService).mockImplementation(
      () =>
        ({
          deleteFiles: mockDeleteFiles,
        }) as any,
    );

    const caller = generationBatchRouter.createCaller(mockCtx);
    const result = await caller.deleteGenerationBatch({ batchId: mockBatchId });

    // Even with partial thumbnail deletion failure, batch deletion should succeed
    expect(result).toEqual(mockDeletedBatch);
    expect(mockDelete).toHaveBeenCalledWith(mockBatchId);
    expect(mockDeleteFiles).toHaveBeenCalledWith(mockThumbnailUrls);
    expect(consoleSpy).toHaveBeenCalledWith('Failed to delete files from S3:', expect.any(Error));

    consoleSpy.mockRestore();
  });

  describe('getGenerationBatches latency enrichment', () => {
    const mockBatches = [
      { id: 'batch-1', model: 'model-a', generations: [] },
      { id: 'batch-2', model: 'model-b', generations: [] },
    ];

    it('should skip latency enrichment when type is omitted', async () => {
      const mockQuery = vi.fn().mockResolvedValue(mockBatches);
      vi.mocked(GenerationBatchModel).mockImplementation(
        () => ({ queryGenerationBatchesByTopicIdWithGenerations: mockQuery }) as any,
      );
      vi.mocked(FileService).mockImplementation(() => ({}) as any);

      const caller = generationBatchRouter.createCaller(mockCtx);
      const result = await caller.getGenerationBatches({ topicId: 'topic-1' });

      expect(result).toEqual(mockBatches);
      expect(getGenerationAvgLatency).not.toHaveBeenCalled();
    });

    it('should enrich batches with latency when type is video', async () => {
      const mockQuery = vi.fn().mockResolvedValue(mockBatches);
      vi.mocked(GenerationBatchModel).mockImplementation(
        () => ({ queryGenerationBatchesByTopicIdWithGenerations: mockQuery }) as any,
      );
      vi.mocked(FileService).mockImplementation(() => ({}) as any);
      vi.mocked(getGenerationAvgLatency).mockImplementation(async (mediaType, model) => {
        expect(mediaType).toBe('video');
        if (model === 'model-a') return 120_000;
        if (model === 'model-b') return 180_000;
        return null;
      });

      const caller = generationBatchRouter.createCaller(mockCtx);
      const result = await caller.getGenerationBatches({ topicId: 'topic-1', type: 'video' });

      expect(result).toEqual([
        { ...mockBatches[0], avgLatencyMs: 120_000 },
        { ...mockBatches[1], avgLatencyMs: 180_000 },
      ]);
    });

    it('should enrich batches with latency when type is image', async () => {
      const mockQuery = vi.fn().mockResolvedValue(mockBatches);
      vi.mocked(GenerationBatchModel).mockImplementation(
        () => ({ queryGenerationBatchesByTopicIdWithGenerations: mockQuery }) as any,
      );
      vi.mocked(FileService).mockImplementation(() => ({}) as any);
      vi.mocked(getGenerationAvgLatency).mockImplementation(async (mediaType, model) => {
        expect(mediaType).toBe('image');
        if (model === 'model-a') return 30_000;
        if (model === 'model-b') return 45_000;
        return null;
      });

      const caller = generationBatchRouter.createCaller(mockCtx);
      const result = await caller.getGenerationBatches({ topicId: 'topic-1', type: 'image' });

      expect(result).toEqual([
        { ...mockBatches[0], avgLatencyMs: 30_000 },
        { ...mockBatches[1], avgLatencyMs: 45_000 },
      ]);
    });

    it('should deduplicate model latency lookups', async () => {
      const sameModelBatches = [
        { id: 'batch-1', model: 'model-a', generations: [] },
        { id: 'batch-2', model: 'model-a', generations: [] },
        { id: 'batch-3', model: 'model-a', generations: [] },
      ];
      const mockQuery = vi.fn().mockResolvedValue(sameModelBatches);
      vi.mocked(GenerationBatchModel).mockImplementation(
        () => ({ queryGenerationBatchesByTopicIdWithGenerations: mockQuery }) as any,
      );
      vi.mocked(FileService).mockImplementation(() => ({}) as any);
      vi.mocked(getGenerationAvgLatency).mockResolvedValue(100_000);

      const caller = generationBatchRouter.createCaller(mockCtx);
      await caller.getGenerationBatches({ topicId: 'topic-1', type: 'video' });

      expect(getGenerationAvgLatency).toHaveBeenCalledTimes(1);
    });

    it('should fallback to null when latency lookup fails', async () => {
      const mockQuery = vi.fn().mockResolvedValue([mockBatches[0]]);
      vi.mocked(GenerationBatchModel).mockImplementation(
        () => ({ queryGenerationBatchesByTopicIdWithGenerations: mockQuery }) as any,
      );
      vi.mocked(FileService).mockImplementation(() => ({}) as any);
      vi.mocked(getGenerationAvgLatency).mockRejectedValue(new Error('DB timeout'));

      const caller = generationBatchRouter.createCaller(mockCtx);
      const result = await caller.getGenerationBatches({ topicId: 'topic-1', type: 'video' });

      expect(result).toEqual([{ ...mockBatches[0], avgLatencyMs: null }]);
    });
  });

  describe('setBatchApprovalStatus', () => {
    const mockBatchId = 'batch-123';
    const mockBatch: GenerationBatchItem = {
      id: mockBatchId,
      userId: 'test-user',
      workspaceId: null,
      generationTopicId: 'topic-1',
      approvalStatus: 'pending',
      provider: 'test-provider',
      model: 'test-model',
      prompt: 'Test prompt',
      width: 1024,
      height: 1024,
      ratio: null,
      config: null,
      accessedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('updates the approval status and persists it', async () => {
      const mockFindById = vi.fn().mockResolvedValue(mockBatch);
      const mockSetApprovalStatus = vi
        .fn()
        .mockResolvedValue({ ...mockBatch, approvalStatus: 'approved' });

      vi.mocked(GenerationBatchModel).mockImplementation(
        () =>
          ({
            findById: mockFindById,
            setApprovalStatus: mockSetApprovalStatus,
          }) as any,
      );

      const caller = generationBatchRouter.createCaller(mockCtx);
      const result = await caller.setBatchApprovalStatus({
        approvalStatus: 'approved',
        batchId: mockBatchId,
      });

      expect(mockSetApprovalStatus).toHaveBeenCalledWith(mockBatchId, 'approved');
      expect(result).toEqual({ ...mockBatch, approvalStatus: 'approved' });
    });

    it('throws NOT_FOUND when the batch does not exist', async () => {
      const mockFindById = vi.fn().mockResolvedValue(undefined);
      const mockSetApprovalStatus = vi.fn();

      vi.mocked(GenerationBatchModel).mockImplementation(
        () =>
          ({
            findById: mockFindById,
            setApprovalStatus: mockSetApprovalStatus,
          }) as any,
      );

      const caller = generationBatchRouter.createCaller(mockCtx);
      await expect(
        caller.setBatchApprovalStatus({ approvalStatus: 'approved', batchId: 'missing-batch' }),
      ).rejects.toThrow('Generation batch not found');
      expect(mockSetApprovalStatus).not.toHaveBeenCalled();
    });

    it('is a no-op when the batch is already at the requested status', async () => {
      const mockFindById = vi.fn().mockResolvedValue(mockBatch);
      const mockSetApprovalStatus = vi.fn();

      vi.mocked(GenerationBatchModel).mockImplementation(
        () =>
          ({
            findById: mockFindById,
            setApprovalStatus: mockSetApprovalStatus,
          }) as any,
      );

      const caller = generationBatchRouter.createCaller(mockCtx);
      const result = await caller.setBatchApprovalStatus({
        approvalStatus: 'pending',
        batchId: mockBatchId,
      });

      expect(result).toEqual(mockBatch);
      expect(mockSetApprovalStatus).not.toHaveBeenCalled();
    });

    it('rejects a workspace member who did not create the batch and is not the owner', async () => {
      const otherUsersBatch: GenerationBatchItem = {
        ...mockBatch,
        userId: 'someone-else',
        workspaceId: 'ws-1',
      };
      const mockFindById = vi.fn().mockResolvedValue(otherUsersBatch);
      const mockSetApprovalStatus = vi.fn();

      vi.mocked(GenerationBatchModel).mockImplementation(
        () =>
          ({
            findById: mockFindById,
            setApprovalStatus: mockSetApprovalStatus,
          }) as any,
      );

      const caller = generationBatchRouter.createCaller({
        ...mockCtx,
        workspaceId: 'ws-1',
        workspaceRole: 'member',
      } as any);

      await expect(
        caller.setBatchApprovalStatus({ approvalStatus: 'approved', batchId: mockBatchId }),
      ).rejects.toThrow(/creator or a workspace owner/);
      expect(mockSetApprovalStatus).not.toHaveBeenCalled();
    });

    it('allows a workspace owner to approve a batch they did not create', async () => {
      const otherUsersBatch: GenerationBatchItem = {
        ...mockBatch,
        userId: 'someone-else',
        workspaceId: 'ws-1',
      };
      const mockFindById = vi.fn().mockResolvedValue(otherUsersBatch);
      const mockSetApprovalStatus = vi
        .fn()
        .mockResolvedValue({ ...otherUsersBatch, approvalStatus: 'approved' });

      vi.mocked(GenerationBatchModel).mockImplementation(
        () =>
          ({
            findById: mockFindById,
            setApprovalStatus: mockSetApprovalStatus,
          }) as any,
      );

      const caller = generationBatchRouter.createCaller({
        ...mockCtx,
        workspaceId: 'ws-1',
        workspaceRole: 'owner',
      } as any);

      const result = await caller.setBatchApprovalStatus({
        approvalStatus: 'approved',
        batchId: mockBatchId,
      });

      expect(mockSetApprovalStatus).toHaveBeenCalledWith(mockBatchId, 'approved');
      expect(result).toEqual({ ...otherUsersBatch, approvalStatus: 'approved' });
    });
  });
});
