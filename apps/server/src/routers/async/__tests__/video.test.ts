// @vitest-environment node
import { resolveBusinessModelMapping } from '@lobechat/business-model-runtime';
import { AsyncTaskStatus } from '@lobechat/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AsyncTaskModel } from '@/database/models/asyncTask';
import { GenerationModel } from '@/database/models/generation';
import { initModelRuntimeFromDB } from '@/server/modules/ModelRuntime';
import { VideoGenerationService } from '@/server/services/generation/video';

import { videoRouter } from '../video';

vi.mock('@/database/models/asyncTask', () => ({ AsyncTaskModel: vi.fn() }));
vi.mock('@/database/models/generation', () => ({ GenerationModel: vi.fn() }));
vi.mock('@/server/services/generation/video', () => ({ VideoGenerationService: vi.fn() }));
vi.mock('@/server/modules/ModelRuntime', () => ({ initModelRuntimeFromDB: vi.fn() }));

vi.mock('@/business/server/getProviderContentPolicyErrorMessage', () => ({
  getProviderContentPolicyErrorMessage: vi.fn(async () => undefined),
}));
vi.mock('@/business/server/video-generation/chargeAfterGenerate', () => ({
  chargeAfterGenerate: vi.fn(),
}));

vi.mock('@lobechat/business-const', async (importOriginal) => ({
  ...((await importOriginal()) as any),
  ENABLE_BUSINESS_FEATURES: false,
}));

vi.mock('@lobechat/business-model-runtime', async (importOriginal) => ({
  ...((await importOriginal()) as any),
  buildMappedBusinessModelFields: vi.fn(() => ({})),
  resolveBusinessModelMapping: vi.fn(),
}));

vi.mock('@/libs/trpc/async', async () => {
  const init = await vi.importActual<{ asyncTrpc: any }>('@/libs/trpc/async/init');
  const { asyncTrpc } = init;
  return {
    asyncAuthedProcedure: asyncTrpc.procedure,
    asyncRouter: asyncTrpc.router,
    createAsyncCallerFactory: asyncTrpc.createCallerFactory,
    publicProcedure: asyncTrpc.procedure,
  };
});

// createVideo's polling failure path exercises the guarded Error write —
// initModelRuntimeFromDB rejecting is the cheapest way into that catch block
// without simulating the full poll-until-completion loop.
describe('videoRouter.createVideo — terminal-state guard on the Error write', () => {
  const userId = 'user_test';
  let mockCtx: any;
  let asyncTaskModelMock: any;

  const createInput = () => ({
    asyncTaskCreatedAt: new Date(),
    asyncTaskId: 'task-1',
    generationBatchId: 'batch-1',
    generationId: 'gen-1',
    generationTopicId: 'topic-1',
    inferenceId: 'inference-1',
    model: 'some-model',
    provider: 'fal',
  });

  beforeEach(() => {
    vi.clearAllMocks();

    asyncTaskModelMock = { update: vi.fn(), updateIfActive: vi.fn().mockResolvedValue(true) };

    vi.mocked(AsyncTaskModel).mockImplementation(() => asyncTaskModelMock);
    vi.mocked(GenerationModel).mockImplementation(() => ({}) as any);
    vi.mocked(VideoGenerationService).mockImplementation(() => ({}) as any);
    vi.mocked(resolveBusinessModelMapping).mockResolvedValue({
      requestedModelId: 'some-model',
      resolvedModelId: 'some-model',
    } as any);
    vi.mocked(initModelRuntimeFromDB).mockRejectedValue(new Error('provider init failed'));

    mockCtx = { serverDB: {}, userId };
  });

  it('marks the task Error via the guarded conditional update when polling fails', async () => {
    const caller = videoRouter.createCaller(mockCtx);
    await caller.createVideo(createInput());

    expect(asyncTaskModelMock.updateIfActive).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ status: AsyncTaskStatus.Error }),
    );
    expect(asyncTaskModelMock.update).not.toHaveBeenCalled();
  });

  it('skips the Error write (without throwing) when the task was already cancelled', async () => {
    asyncTaskModelMock.updateIfActive.mockResolvedValue(false);

    const caller = videoRouter.createCaller(mockCtx);

    // The guard reporting no-op must not surface as a thrown error — the
    // request still resolves normally.
    await expect(caller.createVideo(createInput())).resolves.toBeDefined();

    expect(asyncTaskModelMock.updateIfActive).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ status: AsyncTaskStatus.Error }),
    );
  });
});
