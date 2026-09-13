import debug from 'debug';

import { lambdaClient } from '@/libs/trpc/client';
import {
  type CreateFinalCutInput,
  type FinalCutStatusResult,
} from '@/server/routers/lambda/finalCut';
import { AsyncTaskStatus } from '@/types/asyncTask';

const log = debug('lobe-final-cut:service');

export class FinalCutService {
  /** Kicks off the export; returns immediately with a task id to poll. */
  async create(payload: CreateFinalCutInput): Promise<{ taskId: string }> {
    log('Creating final cut export from %d clip(s)', payload.clipUrls.length);
    return lambdaClient.finalCut.create.mutate(payload);
  }

  async getStatus(taskId: string): Promise<FinalCutStatusResult> {
    return lambdaClient.finalCut.status.query({ taskId });
  }

  /** Polls `getStatus` until the task leaves Pending/Processing, or `signal` aborts. */
  async pollUntilDone(
    taskId: string,
    options?: { intervalMs?: number; signal?: AbortSignal },
  ): Promise<FinalCutStatusResult> {
    const intervalMs = options?.intervalMs ?? 2000;

    while (true) {
      if (options?.signal?.aborted) {
        throw new Error('Final cut export polling aborted');
      }

      const result = await this.getStatus(taskId);
      if (result.status === AsyncTaskStatus.Success || result.status === AsyncTaskStatus.Error) {
        return result;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
}

export const finalCutService = new FinalCutService();
