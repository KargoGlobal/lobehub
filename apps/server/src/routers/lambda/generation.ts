import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { withScopedPermission } from '@/business/server/trpc-middlewares/rbacPermission';
import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { AsyncTaskModel } from '@/database/models/asyncTask';
import { GenerationModel } from '@/database/models/generation';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { FileService } from '@/server/services/file';
import { rescueStuckVideoTask } from '@/server/services/generation/videoBackgroundPolling';
import {
  AsyncTaskError,
  AsyncTaskErrorType,
  AsyncTaskStatus,
  AsyncTaskType,
} from '@/types/asyncTask';
import { type Generation } from '@/types/generation';

import { assertWorkspaceRowManageable } from './_helpers/assertWorkspaceRowManageable';

const generationProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;
  const wsId = ctx.workspaceId ?? undefined;

  return opts.next({
    ctx: {
      asyncTaskModel: new AsyncTaskModel(ctx.serverDB, ctx.userId, wsId),
      fileService: new FileService(ctx.serverDB, ctx.userId, wsId),
      generationModel: new GenerationModel(ctx.serverDB, ctx.userId, wsId),
    },
  });
});

export type GetGenerationStatusResult = {
  error: AsyncTaskError | null;
  generation: Generation | null;
  status: AsyncTaskStatus;
};

export const generationRouter = router({
  deleteGeneration: generationProcedure
    .use(withScopedPermission('file:delete'))
    .input(z.object({ generationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const generation = await ctx.generationModel.findById(input.generationId);
      // Missing row → keep the delete idempotent, nothing to authorize.
      if (!generation) return;
      assertWorkspaceRowManageable(ctx, generation.userId, 'generation');

      // Delete the generation record from database and get the deleted data
      const deletedGeneration = await ctx.generationModel.delete(input.generationId);

      if (!deletedGeneration) return;

      // Note: Based on new requirements, don't delete main file (fileId), only delete thumbnail
      // If generation has a thumbnail, delete it from S3
      if (deletedGeneration.asset) {
        const asset = deletedGeneration.asset as any;

        // Only delete thumbnail URL if exists
        if (asset.thumbnailUrl) {
          await ctx.fileService.deleteFile(asset.thumbnailUrl);
        }
      }

      return deletedGeneration;
    }),

  getGenerationStatus: generationProcedure
    .input(z.object({ asyncTaskId: z.string(), generationId: z.string() }))
    .query(async ({ ctx, input }) => {
      // A video task still `processing` with a provider job id may have simply
      // outlived the background poller (see rescueStuckVideoTask). Ask the
      // provider before the timeout sweep gets a chance to write it off.
      const pending = await ctx.asyncTaskModel.findById(input.asyncTaskId);
      if (
        pending?.type === AsyncTaskType.VideoGeneration &&
        pending.status === AsyncTaskStatus.Processing &&
        pending.inferenceId
      ) {
        const generation = await ctx.generationModel.findById(input.generationId);
        const batch = generation?.generationBatchId
          ? await ctx.serverDB.query.generationBatches.findFirst({
              where: (batches, { eq }) => eq(batches.id, generation.generationBatchId!),
            })
          : undefined;
        if (batch) {
          await rescueStuckVideoTask(ctx.serverDB, {
            asyncTaskCreatedAt: pending.createdAt,
            asyncTaskId: pending.id,
            generationBatchId: batch.id,
            generationId: input.generationId,
            inferenceId: pending.inferenceId,
            provider: batch.provider,
            userId: ctx.userId,
            workspaceId: ctx.workspaceId ?? undefined,
          });
        }
      }

      // Check for timeout tasks before querying
      await ctx.asyncTaskModel.checkTimeoutTasks([input.asyncTaskId]);

      const asyncTask = await ctx.asyncTaskModel.findById(input.asyncTaskId);
      if (!asyncTask) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Async task not found' });
      }

      const { status, error } = asyncTask;
      const result: GetGenerationStatusResult = {
        error: null,
        generation: null,
        status: status as AsyncTaskStatus,
      };

      if (asyncTask.status === AsyncTaskStatus.Success) {
        const generation = await ctx.generationModel.findByIdAndTransform(input.generationId);
        if (!generation) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Generation not found' });
        }

        result.generation = generation;
      } else if (asyncTask.status === AsyncTaskStatus.Error) {
        result.error = error as AsyncTaskError;
      }

      return result;
    }),

  /**
   * Escape hatch for a generation that's taking too long: marks the async
   * task `Error` with a "cancelled" reason so the client stops polling and
   * shows a Cancelled state instead of spinning forever. This never touches
   * the fal job itself — the provider request keeps running until its own
   * abort-controller window elapses (see `routers/async/image.ts` /
   * `routers/async/video.ts`); cancel only releases the UI.
   *
   * A task that already reached a terminal state is left untouched (no-op)
   * so a cancel click that loses a race with real completion can't clobber
   * a result that already arrived.
   */
  cancelGeneration: generationProcedure
    .use(withScopedPermission('generation_batch:update'))
    .input(z.object({ asyncTaskId: z.string(), generationId: z.string() }))
    .mutation(async ({ ctx, input }): Promise<GetGenerationStatusResult> => {
      const generation = await ctx.generationModel.findById(input.generationId);
      if (!generation) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Generation not found' });
      }
      assertWorkspaceRowManageable(ctx, generation.userId, 'generation');

      const asyncTask = await ctx.asyncTaskModel.findById(input.asyncTaskId);
      if (!asyncTask) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Async task not found' });
      }

      if (
        asyncTask.status !== AsyncTaskStatus.Pending &&
        asyncTask.status !== AsyncTaskStatus.Processing
      ) {
        return {
          error: (asyncTask.error as AsyncTaskError) ?? null,
          generation: null,
          status: asyncTask.status as AsyncTaskStatus,
        };
      }

      const error = new AsyncTaskError(AsyncTaskErrorType.TaskCancelled, 'Generation cancelled');
      await ctx.asyncTaskModel.update(input.asyncTaskId, { error, status: AsyncTaskStatus.Error });

      return { error, generation: null, status: AsyncTaskStatus.Error };
    }),
});

export type GenerationRouter = typeof generationRouter;
