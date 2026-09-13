import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FileService } from '@/server/services/file';

const { mockTextToSpeech, mockUploadFromBuffer } = vi.hoisted(() => ({
  mockTextToSpeech: vi.fn(),
  mockUploadFromBuffer: vi.fn(),
}));

vi.mock('@/server/services/file');
vi.mock('@/database/core/db-adaptor', () => ({
  getServerDB: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/database/server', () => ({
  getServerDB: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/server/modules/ModelRuntime', () => ({
  initModelRuntimeFromDB: vi.fn().mockResolvedValue({ textToSpeech: mockTextToSpeech }),
}));
vi.mock('debug', () => ({ default: vi.fn(() => vi.fn()) }));

const { voiceRouter } = await import('../voice');

describe('voiceRouter.generate', () => {
  const mockCtx = { userId: 'test-user' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(FileService).mockImplementation(
      () => ({ uploadFromBuffer: mockUploadFromBuffer }) as any,
    );
    mockUploadFromBuffer.mockResolvedValue({
      fileId: 'file-1',
      key: 'generations/audio/x.mp3',
      url: 'https://app.example.com/f/file-1',
    });
  });

  it('synthesizes speech via the provider runtime and stores it as an mp3 file', async () => {
    mockTextToSpeech.mockResolvedValue(new Uint8Array([1, 2, 3, 4]).buffer);

    const caller = voiceRouter.createCaller(mockCtx);
    const result = await caller.generate({
      kind: 'speech',
      model: 'fal-ai/elevenlabs/tts/turbo-v2.5',
      params: { speed: 1.1 },
      provider: 'fal',
      text: 'Spring sale starts now.',
      voice: 'Rachel',
    });

    expect(mockTextToSpeech).toHaveBeenCalledWith(
      {
        input: 'Spring sale starts now.',
        model: 'fal-ai/elevenlabs/tts/turbo-v2.5',
        params: { speed: 1.1 },
        voice: 'Rachel',
      },
      { user: 'test-user' },
    );
    const [buffer, mime, pathname] = mockUploadFromBuffer.mock.calls[0];
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBe(4);
    expect(mime).toBe('audio/mpeg');
    expect(pathname).toMatch(/^generations\/audio\/speech_spring-sale-starts-now_\d+\.mp3$/);
    expect(result).toEqual({
      fileId: 'file-1',
      kind: 'speech',
      size: 4,
      url: 'https://app.example.com/f/file-1',
    });
  });

  it('rejects a model that does not belong to the requested kind', async () => {
    const caller = voiceRouter.createCaller(mockCtx);
    await expect(
      caller.generate({
        kind: 'music',
        model: 'fal-ai/elevenlabs/tts/turbo-v2.5',
        provider: 'fal',
        text: 'lofi',
      }),
    ).rejects.toThrow(/not a music model/);
    expect(mockTextToSpeech).not.toHaveBeenCalled();
  });

  it('enforces the per-kind text limit', async () => {
    const caller = voiceRouter.createCaller(mockCtx);
    await expect(
      caller.generate({
        kind: 'sfx',
        model: 'fal-ai/elevenlabs/sound-effects/v2',
        provider: 'fal',
        text: 'x'.repeat(451),
      }),
    ).rejects.toThrow(/limited to 450 characters/);
  });

  it('surfaces NOT_IMPLEMENTED when the provider has no audio support', async () => {
    mockTextToSpeech.mockResolvedValue(undefined);
    const caller = voiceRouter.createCaller(mockCtx);
    await expect(
      caller.generate({
        kind: 'speech',
        model: 'fal-ai/minimax/speech-2.8-hd',
        provider: 'fal',
        text: 'hi',
      }),
    ).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
    expect(mockUploadFromBuffer).not.toHaveBeenCalled();
  });
});
