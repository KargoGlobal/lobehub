import { lambdaClient } from '@/libs/trpc/client';

class GenerationService {
  async getGenerationStatus(generationId: string, asyncTaskId: string) {
    return lambdaClient.generation.getGenerationStatus.query({ asyncTaskId, generationId });
  }

  /**
   * Delete a single generation
   */
  async deleteGeneration(generationId: string) {
    return lambdaClient.generation.deleteGeneration.mutate({ generationId });
  }

  /**
   * Cancel an in-flight generation: marks its async task Error with a
   * cancelled reason so polling stops and the batch renders a Cancelled
   * state. Does not abort the underlying provider job.
   */
  async cancelGeneration(generationId: string, asyncTaskId: string) {
    return lambdaClient.generation.cancelGeneration.mutate({ asyncTaskId, generationId });
  }
}

export const generationService = new GenerationService();
