import { RequestTrigger } from '@lobechat/types';
import debug from 'debug';

import { getProviderContentPolicyErrorMessage } from '@/business/server/getProviderContentPolicyErrorMessage';
import { trackProviderContentPolicyViolation } from '@/business/server/trackProviderContentPolicyViolation';
import { AsyncTaskModel } from '@/database/models/asyncTask';
import { GenerationModel } from '@/database/models/generation';
import type { LobeChatDatabase } from '@/database/type';
import { initModelRuntimeFromDB } from '@/server/modules/ModelRuntime';
import { VideoGenerationService } from '@/server/services/generation/video';
import { buildVideoGenerationFilePayload } from '@/server/services/generation/videoFile';
import { AsyncTaskError, AsyncTaskErrorType, AsyncTaskStatus } from '@/types/asyncTask';
import { FileSource } from '@/types/files';
import type { VideoGenerationAsset } from '@/types/generation';

const log = debug('lobe-video:background-polling');

interface BackgroundPollingParams {
  asyncTaskCreatedAt: Date;
  asyncTaskId: string;
  generationBatchId: string;
  generationId: string;
  generationTopicId: string;
  inferenceId: string;
  model: string;
  prechargeResult?: any;
  provider: string;
  userId: string;
  workspaceId?: string;
}

export interface CompleteVideoGenerationParams {
  asyncTaskCreatedAt: Date;
  asyncTaskId: string;
  generationBatchId: string;
  generationId: string;
  userId: string;
  workspaceId?: string;
}

/**
 * Download → post-process → upload → persist asset → mark the task done.
 * Shared by the background poller and by `rescueStuckVideoTask`, so a clip
 * that finished on the provider's side is recorded the same way regardless of
 * which path noticed it first.
 */
export async function completeVideoGeneration(
  db: LobeChatDatabase,
  params: CompleteVideoGenerationParams,
  result: { headers?: Record<string, string>; videoUrl: string },
): Promise<void> {
  const { asyncTaskCreatedAt, asyncTaskId, generationBatchId, generationId, userId, workspaceId } =
    params;
  const asyncTaskModel = new AsyncTaskModel(db, userId, workspaceId);
  const videoService = new VideoGenerationService(db, userId, workspaceId);
  const generationModel = new GenerationModel(db, userId, workspaceId);

  const processResult = await videoService.processVideoForGeneration(result.videoUrl, {
    headers: result.headers,
  });

  const asset: VideoGenerationAsset = {
    coverUrl: processResult.coverKey,
    duration: processResult.duration,
    height: processResult.height,
    originalUrl: result.videoUrl,
    thumbnailUrl: processResult.thumbnailKey,
    type: 'video',
    url: processResult.videoKey,
    width: processResult.width,
  };

  const batch = await db.query.generationBatches.findFirst({
    where: (batches, { eq }) => eq(batches.id, generationBatchId),
  });

  await generationModel.createAssetAndFile(
    generationId,
    asset,
    buildVideoGenerationFilePayload({
      generationId,
      processResult,
      prompt: batch?.prompt,
    }),
    FileSource.VideoGeneration,
  );

  await asyncTaskModel.update(asyncTaskId, {
    duration: Date.now() - asyncTaskCreatedAt.getTime(),
    status: AsyncTaskStatus.Success,
  });
}

export interface RescueStuckVideoTaskParams extends CompleteVideoGenerationParams {
  inferenceId: string;
  provider: string;
}

/**
 * One-shot check of a task that is still `processing` on our side. The
 * background poller runs in the request's post-response hook and dies with
 * the serverless function, so a render that outlives it (Veo commonly takes
 * several minutes) was never recorded — the UI spun forever and the clip was
 * paid for but lost. Whoever next asks for the task's status triggers this:
 * ask the provider once; if the clip is done, finish it; if the provider says
 * it failed, mark it failed; otherwise leave it alone.
 *
 * Returns true when the task was moved to a terminal state.
 */
export async function rescueStuckVideoTask(
  db: LobeChatDatabase,
  params: RescueStuckVideoTaskParams,
): Promise<boolean> {
  const { inferenceId, provider, userId, workspaceId, asyncTaskId } = params;
  try {
    const modelRuntime = await initModelRuntimeFromDB(db, userId, provider, workspaceId);
    const pollResult = await modelRuntime.handlePollVideoStatus(inferenceId);
    if (!pollResult || pollResult.status === 'pending') return false;

    if (pollResult.status === 'failed') {
      const asyncTaskModel = new AsyncTaskModel(db, userId, workspaceId);
      await asyncTaskModel.update(asyncTaskId, {
        error: new AsyncTaskError(AsyncTaskErrorType.ServerError, pollResult.error),
        status: AsyncTaskStatus.Error,
      });
      return true;
    }

    log('Rescuing stuck video task %s: provider reports it finished', asyncTaskId);
    await completeVideoGeneration(db, params, {
      // Some providers (fal) attach download headers; the shared interface omits them.
      headers: (pollResult as { headers?: Record<string, string> }).headers,
      videoUrl: pollResult.videoUrl,
    });
    return true;
  } catch (error) {
    // A rescue is best-effort; never let it break the status request.
    log('Rescue attempt for task %s failed: %O', asyncTaskId, error);
    return false;
  }
}

export async function processBackgroundVideoPolling(
  db: LobeChatDatabase,
  params: BackgroundPollingParams,
): Promise<void> {
  const {
    asyncTaskCreatedAt,
    asyncTaskId,
    generationBatchId,
    generationId,
    inferenceId,
    model,
    provider,
    userId,
    workspaceId,
  } = params;

  log(
    'Starting background video polling for task: %s (provider: %s, inferenceId: %s)',
    asyncTaskId,
    provider,
    inferenceId,
  );

  try {
    const modelRuntime = await initModelRuntimeFromDB(db, userId, provider, workspaceId);
    const pollResult = await pollUntilCompletion(modelRuntime, inferenceId);

    if (!pollResult) {
      throw new Error('Polling completed but no video URL returned');
    }

    log('Video polling succeeded for task: %s, processing video...', asyncTaskId);

    await completeVideoGeneration(
      db,
      { asyncTaskCreatedAt, asyncTaskId, generationBatchId, generationId, userId, workspaceId },
      pollResult,
    );

    log('Video processing completed successfully for task: %s', asyncTaskId);
  } catch (error) {
    log('Background video polling error for task: %s', asyncTaskId, error);

    const asyncTaskModel = new AsyncTaskModel(db, userId, workspaceId);
    const providerContentPolicyMessage = await getProviderContentPolicyErrorMessage({
      error,
      provider,
      trigger: RequestTrigger.Video,
      userId,
    });
    if (providerContentPolicyMessage) {
      try {
        await trackProviderContentPolicyViolation({
          error,
          model,
          provider,
          trigger: 'video-polling',
          userId,
        });
      } catch (trackError) {
        log('Failed to track provider content policy violation: %O', trackError);
      }
    }
    await asyncTaskModel.update(asyncTaskId, {
      error: new AsyncTaskError(
        providerContentPolicyMessage
          ? AsyncTaskErrorType.ProviderContentModeration
          : AsyncTaskErrorType.ServerError,
        providerContentPolicyMessage ??
          'Background polling failed: ' +
            (error instanceof Error ? error.message : 'Unknown error'),
      ),
      status: AsyncTaskStatus.Error,
    });
  }
}

async function pollUntilCompletion(
  modelRuntime: any,
  inferenceId: string,
): Promise<{ headers?: Record<string, string>; videoUrl: string } | null> {
  const maxRetries = 120;
  const pollingInterval = 5000;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      log('Polling attempt %d/%d for task: %s', attempt + 1, maxRetries, inferenceId);

      const result = await modelRuntime.handlePollVideoStatus(inferenceId);

      if (result.status === 'success') {
        log('Video generation succeeded for task: %s', inferenceId);
        return { headers: result.headers, videoUrl: result.videoUrl };
      }

      if (result.status === 'failed') {
        throw new Error(`Video generation failed: ${result.error}`);
      }

      log('Task %s still in progress', inferenceId);
      await sleep(pollingInterval);
    } catch (error) {
      if (error instanceof Error && error.message.includes('failed')) {
        throw error;
      }
      log('Polling attempt %d failed for task: %s: %O', attempt + 1, inferenceId, error);
      await sleep(pollingInterval);
    }
  }

  throw new Error(
    `Video generation timeout after ${maxRetries} attempts (${(maxRetries * pollingInterval) / 1000}s)`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
