import { timingSafeEqual } from 'node:crypto';

import {
  buildMappedBusinessModelFields,
  resolveBusinessModelMapping,
} from '@lobechat/business-model-runtime';
import { ModelRuntime } from '@lobechat/model-runtime';
import {
  AsyncTaskError,
  AsyncTaskErrorType,
  AsyncTaskStatus,
  FileSource,
  type VideoGenerationAsset,
  type VideoGenerationTaskMetadata,
} from '@lobechat/types';
import debug from 'debug';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import type { BlankEnv } from 'hono/types';
import { type RuntimeVideoGenParams } from 'model-bank';

import { chargeAfterGenerate } from '@/business/server/video-generation/chargeAfterGenerate';
import { notifyVideoCompleted } from '@/business/server/video-generation/notifyVideoCompleted';
import { AsyncTaskModel } from '@/database/models/asyncTask';
import { GenerationModel } from '@/database/models/generation';
import { generationBatches } from '@/database/schemas';
import { getServerDB } from '@/database/server';
import { VideoGenerationService } from '@/server/services/generation/video';
import { sanitizeFileName } from '@/utils/sanitizeFileName';

const log = debug('lobe-video:webhook');

/** Constant-time string comparison that handles different lengths safely */
const safeCompare = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
};

/**
 * Async video generation callback, one route per provider (`/video/:provider`).
 */
export const videoWebhook = async (c: Context<BlankEnv, '/video/:provider'>) => {
  const provider = c.req.param('provider');

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  log('Received video webhook for provider: %s, body: %O', provider, body);

  let asyncTaskModel: AsyncTaskModel | undefined;
  let asyncTaskId: string | undefined;
  let asyncTaskUserId: string | undefined;
  let asyncTaskWorkspaceId: string | undefined;
  let asyncTaskMetadata: VideoGenerationTaskMetadata | undefined;

  try {
    const runtime = ModelRuntime.initializeWithProvider(provider, {
      apiKey: 'webhook-placeholder',
    });
    const query = Object.fromEntries(new URL(c.req.url).searchParams);
    const result = await runtime.handleCreateVideoWebhook({ body, query });

    if (!result) {
      return c.json({ error: `Provider ${provider} does not support video webhook` }, 400);
    }

    // Skip intermediate statuses (e.g. queued, running)
    if (result.status === 'pending') {
      log('Skipping intermediate status for provider: %s', provider);
      return c.json({ success: true });
    }

    log('Webhook parse result: %O', result);

    const db = await getServerDB();

    // Find asyncTask by inferenceId
    const asyncTask = await AsyncTaskModel.findByInferenceId(db, result.inferenceId);
    if (!asyncTask) {
      log('AsyncTask not found for inferenceId: %s', result.inferenceId);
      return c.json({ error: `AsyncTask not found for inferenceId: ${result.inferenceId}` }, 404);
    }

    // Verify webhook token to prevent forged callbacks
    const url = new URL(c.req.url);
    const token = url.searchParams.get('token');
    const metadata = asyncTask.metadata as VideoGenerationTaskMetadata | undefined;
    const expectedToken = metadata?.webhookToken;

    if (!expectedToken || !token || !safeCompare(token, expectedToken)) {
      log('Webhook token verification failed for asyncTask: %s', asyncTask.id);
      return c.json({ error: 'Unauthorized' }, 401);
    }
    log('Webhook token verified for asyncTask: %s', asyncTask.id);

    asyncTaskId = asyncTask.id;
    asyncTaskUserId = asyncTask.userId;
    asyncTaskWorkspaceId = asyncTask.workspaceId ?? undefined;
    asyncTaskMetadata = metadata;

    log(
      'Found asyncTask: %s, userId: %s, status: %s',
      asyncTask.id,
      asyncTask.userId,
      asyncTask.status,
    );

    // Idempotency: skip if already in terminal state (provider may retry callbacks)
    if (
      asyncTask.status === AsyncTaskStatus.Success ||
      asyncTask.status === AsyncTaskStatus.Error
    ) {
      log('AsyncTask %s already in terminal state: %s, skipping', asyncTask.id, asyncTask.status);
      return c.json({ success: true });
    }

    const generationModel = new GenerationModel(
      db,
      asyncTask.userId,
      asyncTask.workspaceId ?? undefined,
    );

    // Find generation by asyncTaskId
    const generation = await generationModel.findByAsyncTaskId(asyncTask.id);
    if (!generation) {
      log('Generation not found for asyncTaskId: %s', asyncTask.id);
      return c.json({ error: `Generation not found for asyncTaskId: ${asyncTask.id}` }, 404);
    }

    log('Found generation: %s', generation.id);

    asyncTaskModel = new AsyncTaskModel(db, asyncTask.userId, asyncTask.workspaceId ?? undefined);

    // Query batch to get model info for both error and success paths
    const batch = await db.query.generationBatches.findFirst({
      where: eq(generationBatches.id, generation.generationBatchId!),
    });
    const requestedModel = batch?.model ?? '';
    // Resolve mapping so spend log metadata and pricing lookup use the billed model id,
    // not the user-facing alias nor the provider-reported internal name.
    const { resolvedModelId } = requestedModel
      ? await resolveBusinessModelMapping(provider, requestedModel)
      : { resolvedModelId: '' };

    const mappedModelFields = buildMappedBusinessModelFields({
      provider,
      requestedModelId: resolvedModelId === requestedModel ? undefined : requestedModel,
      resolvedModelId,
    });

    // Handle error result: refund precharge and mark task as error
    if (result.status === 'error') {
      log('Video generation failed: %s', result.error);
      // Guarded: the idempotency check above only looked at the task's
      // status once, before the (potentially seconds-long) business-model
      // mapping lookup. A cancel landing in that window must not be
      // overwritten by this webhook's completion write.
      const applied = await asyncTaskModel.updateIfActive(asyncTask.id, {
        error: new AsyncTaskError(AsyncTaskErrorType.ServerError, result.error),
        status: AsyncTaskStatus.Error,
      });
      if (!applied) {
        log(
          'AsyncTask %s is no longer active (likely cancelled); skipping Error write',
          asyncTask.id,
        );
        return c.json({ success: true });
      }

      try {
        await chargeAfterGenerate({
          isError: true,
          metadata: {
            asyncTaskId: asyncTask.id,
            generationBatchId: generation.generationBatchId!,
            topicId: batch?.generationTopicId,
            ...mappedModelFields,
          },
          model: resolvedModelId,
          prechargeResult: metadata?.precharge as any,
          provider,
          userId: asyncTask.userId,
          workspaceId: asyncTask.workspaceId ?? undefined,
        });
      } catch (refundError) {
        console.error('[video-webhook] Failed to refund precharge on error:', refundError);
      }

      return c.json({ success: true });
    }

    // Handle success result: download video → process → upload S3 → create asset and file
    const videoService = new VideoGenerationService(
      db,
      asyncTask.userId,
      asyncTask.workspaceId ?? undefined,
    );
    const processResult = await videoService.processVideoForGeneration(result.videoUrl);

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

    await generationModel.createAssetAndFile(
      generation.id,
      asset,
      {
        fileHash: processResult.fileHash,
        fileType: processResult.mimeType,
        name: `${sanitizeFileName(batch?.prompt ?? '', generation.id)}.mp4`,
        size: processResult.fileSize,
        url: processResult.videoKey,
      },
      FileSource.VideoGeneration,
    );

    const duration = Date.now() - asyncTask.createdAt.getTime();

    // Guarded for the same reason as the Error write above: the
    // download/process/upload/asset-creation work just above can take
    // seconds, long enough for a cancel to land in between.
    const applied = await asyncTaskModel.updateIfActive(asyncTask.id, {
      duration,
      status: AsyncTaskStatus.Success,
    });
    if (!applied) {
      log(
        'AsyncTask %s is no longer active (likely cancelled); skipping Success write',
        asyncTask.id,
      );
      return c.json({ success: true });
    }

    try {
      await notifyVideoCompleted({
        generationBatchId: generation.generationBatchId!,
        model: requestedModel,
        prompt: batch?.prompt ?? '',
        topicId: batch?.generationTopicId,
        userId: asyncTask.userId,
        workspaceId: asyncTask.workspaceId ?? undefined,
      });
    } catch (err) {
      console.error('[video-webhook] notification failed:', err);
    }

    // Charge after successful video generation
    try {
      await chargeAfterGenerate({
        computePriceParams: {
          generateAudio: (batch?.config as RuntimeVideoGenParams)?.generateAudio,
          resolution: (batch?.config as RuntimeVideoGenParams)?.resolution,
        },
        latency: duration,
        metadata: {
          asyncTaskId: asyncTask.id,
          generationBatchId: generation.generationBatchId!,
          topicId: batch?.generationTopicId,
          ...mappedModelFields,
        },
        model: resolvedModelId,
        prechargeResult: metadata?.precharge as any,
        provider,
        usage: result.usage,
        userId: asyncTask.userId,
        workspaceId: asyncTask.workspaceId ?? undefined,
      });
    } catch (chargeError) {
      console.error('[video-webhook] Failed to charge after generate:', chargeError);
    }

    log('Video webhook processing completed successfully for generation: %s', generation.id);

    return c.json({ success: true });
  } catch (error) {
    console.error('[video-webhook] Processing failed:', error);

    // Tracks whether the guarded write below actually applied, so a task
    // that turns out to already be terminal (cancelled, or resolved by a
    // concurrent write) can be reported as handled rather than "failed".
    // Defaults true: if we never got far enough to attempt the write (e.g.
    // this asyncTask/asyncTaskId weren't resolved yet), the original 500
    // behavior is preserved below.
    let taskStillActive = true;

    // Mark asyncTask as Error so the user sees failure instead of stuck "processing"
    if (asyncTaskModel && asyncTaskId) {
      try {
        taskStillActive = await asyncTaskModel.updateIfActive(asyncTaskId, {
          error: new AsyncTaskError(AsyncTaskErrorType.ServerError, (error as Error).message),
          status: AsyncTaskStatus.Error,
        });
        if (!taskStillActive) {
          log(
            'AsyncTask %s is no longer active; skipping Error write in catch-all handler',
            asyncTaskId,
          );
        }
      } catch (updateError) {
        console.error('[video-webhook] Failed to update asyncTask status:', updateError);
      }
    }

    // Refund precharge on unexpected failure — worth attempting even when the
    // task was already terminal (e.g. cancelled): the user shouldn't be
    // billed for a request that also blew up server-side.
    if (asyncTaskUserId && asyncTaskMetadata?.precharge) {
      try {
        await chargeAfterGenerate({
          isError: true,
          metadata: { asyncTaskId: asyncTaskId ?? '', generationBatchId: '', modelId: '' },
          model: '',
          prechargeResult: asyncTaskMetadata.precharge as any,
          provider,
          userId: asyncTaskUserId,
          workspaceId: asyncTaskWorkspaceId,
        });
      } catch (refundError) {
        console.error('[video-webhook] Failed to refund precharge on failure:', refundError);
      }
    }

    // A task that's already terminal isn't actually stuck — tell the
    // provider there's nothing to retry instead of a 500, which would
    // otherwise retry-loop a webhook that has nothing left to do.
    if (!taskStillActive) {
      return c.json({ success: true });
    }

    return c.json({ error: (error as Error).message }, 500);
  }
};
