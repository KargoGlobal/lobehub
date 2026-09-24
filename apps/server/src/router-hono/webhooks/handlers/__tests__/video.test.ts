import { AsyncTaskStatus } from '@lobechat/types';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as AsyncTaskModelModule from '@/database/models/asyncTask';

const mocks = vi.hoisted(() => ({
  chargeAfterGenerate: vi.fn(),
  createAssetAndFile: vi.fn(),
  findByAsyncTaskId: vi.fn(),
  findByInferenceId: vi.fn(),
  findFirstBatch: vi.fn(),
  handleCreateVideoWebhook: vi.fn(),
  notifyVideoCompleted: vi.fn(),
  processVideoForGeneration: vi.fn(),
  updateIfActive: vi.fn(),
}));

vi.mock('@/database/models/asyncTask', async (importOriginal) => {
  const actual = await importOriginal<typeof AsyncTaskModelModule>();

  return {
    ...actual,
    AsyncTaskModel: Object.assign(
      vi.fn(() => ({ updateIfActive: mocks.updateIfActive })),
      { findByInferenceId: mocks.findByInferenceId },
    ),
  };
});

vi.mock('@/database/models/generation', () => ({
  GenerationModel: vi.fn(() => ({
    createAssetAndFile: mocks.createAssetAndFile,
    findByAsyncTaskId: mocks.findByAsyncTaskId,
  })),
}));

vi.mock('@/database/server', () => ({
  getServerDB: vi.fn(async () => ({
    query: {
      generationBatches: {
        findFirst: mocks.findFirstBatch,
      },
    },
  })),
}));

vi.mock('@lobechat/model-runtime', () => ({
  ModelRuntime: {
    initializeWithProvider: vi.fn(() => ({
      handleCreateVideoWebhook: mocks.handleCreateVideoWebhook,
    })),
  },
}));

vi.mock('@lobechat/business-model-runtime', () => ({
  buildMappedBusinessModelFields: vi.fn(() => ({})),
  resolveBusinessModelMapping: vi.fn(async () => ({ resolvedModelId: 'test-model' })),
}));

vi.mock('@/business/server/video-generation/chargeAfterGenerate', () => ({
  chargeAfterGenerate: mocks.chargeAfterGenerate,
}));

vi.mock('@/business/server/video-generation/notifyVideoCompleted', () => ({
  notifyVideoCompleted: mocks.notifyVideoCompleted,
}));

vi.mock('@/server/services/generation/video', () => ({
  VideoGenerationService: vi.fn(() => ({
    processVideoForGeneration: mocks.processVideoForGeneration,
  })),
}));

vi.mock('@/utils/sanitizeFileName', () => ({
  sanitizeFileName: vi.fn((...args) => args.join('-')),
}));

const { videoWebhook } = await import('../video');

/** Mounts just this route, matching the sibling webhook handler tests' convention. */
const app = new Hono().basePath('/api/webhooks');
app.post('/video/:provider', videoWebhook);

const webhookToken = 'valid-token';

const baseAsyncTask = {
  createdAt: new Date('2026-09-01T00:00:00Z'),
  id: 'task-1',
  metadata: { webhookToken },
  status: AsyncTaskStatus.Processing,
  userId: 'user-1',
  workspaceId: null,
};

const createRequest = (body: Record<string, unknown>, token = webhookToken) =>
  new Request(`https://app.example.com/api/webhooks/video/fal?token=${token}`, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });

describe('videoWebhook — terminal-state guard on completion writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.findByInferenceId.mockResolvedValue(baseAsyncTask);
    mocks.findByAsyncTaskId.mockResolvedValue({
      generationBatchId: 'batch-1',
      id: 'gen-1',
    });
    mocks.findFirstBatch.mockResolvedValue({
      config: {},
      generationTopicId: 'topic-1',
      model: 'test-model',
      prompt: 'a prompt',
    });
    mocks.chargeAfterGenerate.mockResolvedValue(undefined);
    mocks.notifyVideoCompleted.mockResolvedValue(undefined);
    mocks.createAssetAndFile.mockResolvedValue(undefined);
  });

  it('leaves a cancelled task Cancelled when a success webhook arrives, and returns 2xx', async () => {
    // The idempotency check up top only sees Processing (the race hasn't
    // happened yet from the webhook's point of view); updateIfActive is what
    // discovers the task was cancelled in the meantime.
    mocks.updateIfActive.mockResolvedValue(false);
    mocks.handleCreateVideoWebhook.mockResolvedValue({
      inferenceId: 'inference-1',
      status: 'success',
      usage: {},
      videoUrl: 'https://example.com/video.mp4',
    });
    mocks.processVideoForGeneration.mockResolvedValue({
      coverKey: 'cover.webp',
      duration: 8,
      fileHash: 'hash',
      fileSize: 100,
      height: 1080,
      mimeType: 'video/mp4',
      thumbnailKey: 'thumb.webp',
      videoKey: 'v.mp4',
      width: 1920,
    });

    const response = await app.fetch(createRequest({ any: 'payload' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });

    expect(mocks.updateIfActive).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ status: AsyncTaskStatus.Success }),
    );
    // The write was skipped, so nothing downstream (notification, billing)
    // ran for a generation the user no longer wants.
    expect(mocks.notifyVideoCompleted).not.toHaveBeenCalled();
    expect(mocks.chargeAfterGenerate).not.toHaveBeenCalled();
  });

  it('leaves a cancelled task Cancelled when an error webhook arrives, and returns 2xx', async () => {
    mocks.updateIfActive.mockResolvedValue(false);
    mocks.handleCreateVideoWebhook.mockResolvedValue({
      error: 'provider reported failure',
      inferenceId: 'inference-1',
      status: 'error',
    });

    const response = await app.fetch(createRequest({ any: 'payload' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });

    expect(mocks.updateIfActive).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ status: AsyncTaskStatus.Error }),
    );
    expect(mocks.chargeAfterGenerate).not.toHaveBeenCalled();
  });

  it('still marks the task Error and returns 2xx on a real (non-race) provider failure', async () => {
    mocks.updateIfActive.mockResolvedValue(true);
    mocks.handleCreateVideoWebhook.mockResolvedValue({
      error: 'provider reported failure',
      inferenceId: 'inference-1',
      status: 'error',
    });

    const response = await app.fetch(createRequest({ any: 'payload' }));

    expect(response.status).toBe(200);
    expect(mocks.updateIfActive).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ status: AsyncTaskStatus.Error }),
    );
    expect(mocks.chargeAfterGenerate).toHaveBeenCalledTimes(1);
  });

  it('reports success (not 500) when the catch-all handler finds the task already terminal', async () => {
    mocks.updateIfActive.mockResolvedValue(false);
    // Force the try block to throw after asyncTaskModel/asyncTaskId are set,
    // landing in the catch-all handler.
    mocks.findFirstBatch.mockRejectedValue(new Error('db blew up'));
    mocks.handleCreateVideoWebhook.mockResolvedValue({
      inferenceId: 'inference-1',
      status: 'success',
      videoUrl: 'https://example.com/video.mp4',
    });

    const response = await app.fetch(createRequest({ any: 'payload' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mocks.updateIfActive).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ status: AsyncTaskStatus.Error }),
    );
  });

  it('returns 500 from the catch-all handler for a genuine (non-race) unexpected failure', async () => {
    mocks.updateIfActive.mockResolvedValue(true);
    mocks.findFirstBatch.mockRejectedValue(new Error('db blew up'));
    mocks.handleCreateVideoWebhook.mockResolvedValue({
      inferenceId: 'inference-1',
      status: 'success',
      videoUrl: 'https://example.com/video.mp4',
    });

    const response = await app.fetch(createRequest({ any: 'payload' }));

    expect(response.status).toBe(500);
  });
});
