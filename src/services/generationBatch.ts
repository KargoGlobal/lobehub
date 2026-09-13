import { type GenerationBatchItem } from '@/database/schemas';
import { lambdaClient } from '@/libs/trpc/client';
import {
  type Generation,
  type GenerationBatch,
  type GenerationBatchApprovalStatus,
} from '@/types/generation';

type GenerationBatchWithAsyncTaskId = GenerationBatch & {
  generations: (Generation & { asyncTaskId?: string | null })[];
};

class GenerationBatchService {
  /**
   * Get generation batches for a specific topic
   */
  async getGenerationBatches(
    topicId: string,
    type?: 'image' | 'video',
  ): Promise<GenerationBatchWithAsyncTaskId[]> {
    return lambdaClient.generationBatch.getGenerationBatches.query({ topicId, type });
  }

  /**
   * Delete a generation batch
   */
  async deleteGenerationBatch(batchId: string): Promise<GenerationBatchItem | undefined> {
    return lambdaClient.generationBatch.deleteGenerationBatch.mutate({ batchId });
  }

  /**
   * Set a generation batch's review status.
   */
  async setBatchApprovalStatus(
    batchId: string,
    approvalStatus: GenerationBatchApprovalStatus,
  ): Promise<GenerationBatchItem | undefined> {
    return lambdaClient.generationBatch.setBatchApprovalStatus.mutate({
      approvalStatus,
      batchId,
    });
  }
}

export const generationBatchService = new GenerationBatchService();
