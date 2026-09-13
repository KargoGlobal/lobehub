import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { withScopedPermission } from '@/business/server/trpc-middlewares/rbacPermission';
import {
  requireWorkspaceRoleWhenScoped,
  wsCompatProcedure,
} from '@/business/server/trpc-middlewares/workspaceAuth';
import { AsyncTaskModel } from '@/database/models/asyncTask';
import { getServerDB } from '@/database/server';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { FileService } from '@/server/services/file';
import { FinalCutService } from '@/server/services/generation/finalCut';
import { after } from '@/server/utils/scheduleAfterResponse';
import {
  AsyncTaskError,
  AsyncTaskErrorType,
  AsyncTaskStatus,
  AsyncTaskType,
  type FinalCutExportTaskMetadata,
} from '@/types/asyncTask';

/**
 * Final-cut assembly & export: concatenate a topic's generated clips in order and (optionally)
 * replace their audio with one uploaded/generated track. Gated the same way as voice.ts — this
 * produces an ordinary MP4 file, not a `generations` row, so `file:upload` is the right scope.
 */
const finalCutProcedure = wsCompatProcedure
  .use(serverDatabase)
  .use(requireWorkspaceRoleWhenScoped('member'))
  .use(withScopedPermission('file:upload'))
  .use(async (opts) => {
    const { ctx } = opts;
    const wsId = ctx.workspaceId ?? undefined;

    return opts.next({
      ctx: {
        asyncTaskModel: new AsyncTaskModel(ctx.serverDB, ctx.userId, wsId),
        fileService: new FileService(ctx.serverDB, ctx.userId, wsId),
      },
    });
  });

export const MIN_FINAL_CUT_CLIPS = 2;
export const MAX_FINAL_CUT_CLIPS = 12;

const createFinalCutInputSchema = z.object({
  audioUrl: z.string().url().optional(),
  clipUrls: z.array(z.string().url()).min(MIN_FINAL_CUT_CLIPS).max(MAX_FINAL_CUT_CLIPS),
});
export type CreateFinalCutInput = z.infer<typeof createFinalCutInputSchema>;

export interface FinalCutStatusResult {
  durationSeconds?: number;
  error: unknown | null;
  status: AsyncTaskStatus;
  url?: string;
}

/**
 * SSRF guard: `FinalCutService` fetches every clip/audio URL itself (it isn't just forwarding
 * the URL to a third party the way the image/video generation routers forward URLs to fal.ai),
 * so a raw client-supplied URL must never reach it. Resolve it to this app's own storage key
 * first — the same `getKeyFromFullUrl` pattern `routers/lambda/video/index.ts` uses for
 * `imageUrl`/`endImageUrl`/the talking-performer fields — and reject outright if it doesn't
 * resolve to a real stored object, rather than silently falling back to the original URL the way
 * that router does (acceptable there, since an unresolved URL just gets forwarded to fal.ai and
 * never fetched by this server; not acceptable here).
 */
async function resolveStoredKeyOrThrow(
  fileService: FileService,
  url: string,
  label: string,
): Promise<string> {
  const key = await fileService.getKeyFromFullUrl(url);
  if (!key) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `${label} is not a file stored in this app: ${url}`,
    });
  }
  return key;
}

export const finalCutRouter = router({
  /**
   * Kicks off the ffmpeg export and returns immediately with a task id — the actual
   * download/concat/mux work (several seconds to tens of seconds for a handful of clips) runs
   * in `after()`, post-response, exactly like the background video-generation polling in
   * routers/lambda/video.ts. The client polls `status` with the returned id.
   */
  create: finalCutProcedure.input(createFinalCutInputSchema).mutation(async ({ ctx, input }) => {
    const { userId, asyncTaskModel, fileService } = ctx;
    const wsId = ctx.workspaceId ?? undefined;

    // Resolve (and validate) every URL against this app's own storage BEFORE creating any
    // task — an invalid/unrecognized URL must reject the request outright, not fail an async
    // job later. See resolveStoredKeyOrThrow's doc comment for why this check exists.
    const clipKeys: string[] = [];
    for (const [index, url] of input.clipUrls.entries()) {
      clipKeys.push(await resolveStoredKeyOrThrow(fileService, url, `Clip #${index + 1}`));
    }
    const audioKey = input.audioUrl
      ? await resolveStoredKeyOrThrow(fileService, input.audioUrl, 'Audio track')
      : undefined;

    const taskId = await asyncTaskModel.create({
      status: AsyncTaskStatus.Pending,
      type: AsyncTaskType.FinalCutExport,
    });

    after(async () => {
      try {
        await asyncTaskModel.update(taskId, { status: AsyncTaskStatus.Processing });

        const db = await getServerDB();
        const service = new FinalCutService(db, userId, wsId);
        const result = await service.assembleFinalCut(clipKeys, audioKey);

        const metadata: FinalCutExportTaskMetadata = {
          durationSeconds: result.durationSeconds,
          fileId: result.fileId,
          url: result.url,
        };
        await asyncTaskModel.update(taskId, { metadata, status: AsyncTaskStatus.Success });
      } catch (error) {
        console.error('[finalCut] Export failed for task %s:', taskId, error);
        await asyncTaskModel.update(taskId, {
          error: new AsyncTaskError(
            AsyncTaskErrorType.ServerError,
            error instanceof Error ? error.message : String(error),
          ),
          status: AsyncTaskStatus.Error,
        });
      }
    });

    return { taskId };
  }),

  /**
   * There is no `generations` row for a final cut (see FinalCutExportTaskMetadata), so the
   * asyncTask's own metadata doubles as the result payload once it reaches `success`.
   */
  status: finalCutProcedure
    .input(z.object({ taskId: z.string() }))
    .query(async ({ ctx, input }): Promise<FinalCutStatusResult> => {
      await ctx.asyncTaskModel.checkTimeoutTasks([input.taskId]);

      const task = await ctx.asyncTaskModel.findById(input.taskId);
      if (!task) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Final cut export task not found' });
      }

      const metadata = (task.metadata ?? {}) as FinalCutExportTaskMetadata;
      const status = task.status as AsyncTaskStatus;

      return {
        durationSeconds: metadata.durationSeconds,
        error: status === AsyncTaskStatus.Error ? task.error : null,
        status,
        url: metadata.url,
      };
    }),
});

export type FinalCutRouter = typeof finalCutRouter;
