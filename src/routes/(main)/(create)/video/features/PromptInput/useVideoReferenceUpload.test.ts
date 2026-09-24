import { toast } from '@lobehub/ui/base-ui';
import { act, renderHook } from '@testing-library/react';
import { type VideoModelParamsSchema } from 'model-bank';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAiInfraStore } from '@/store/aiInfra';
import { useVideoStore } from '@/store/video';

import { resolveReferenceLimitMessage, useVideoReferenceUpload } from './useVideoReferenceUpload';

vi.mock('@lobehub/ui/base-ui', () => ({
  toast: { warning: vi.fn() },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      `${key}${options ? `:${JSON.stringify(options)}` : ''}`,
  }),
}));

const textOnlySchema: VideoModelParamsSchema = {
  duration: { default: 8, enum: [4, 6, 8] },
  prompt: { default: '' },
};

const imageCapableSchema: VideoModelParamsSchema = {
  imageUrl: { default: null },
  prompt: { default: '' },
};

describe('resolveReferenceLimitMessage (pure)', () => {
  it('names the model instead of saying "up to 0" when the model takes no reference image', () => {
    const result = resolveReferenceLimitMessage({ maxCount: 0, modelDisplayName: 'Veo 3.1' });

    expect(result.key).toBe('config.imageUpload.notSupported');
    expect(result.options).toEqual({ model: 'Veo 3.1' });
    // Regression guard: never regress to the "up to 0" phrasing.
    expect(result.key).not.toBe('config.imageUpload.maxCountReached');
  });

  it('reports the real capacity when a positive limit is exceeded', () => {
    const result = resolveReferenceLimitMessage({ maxCount: 4, modelDisplayName: 'MiniMax H3' });

    expect(result).toEqual({
      key: 'config.imageUpload.maxCountReached',
      options: { count: 4 },
    });
  });
});

describe('useVideoReferenceUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAiInfraStore.setState({
      enabledVideoModelList: [
        {
          children: [{ displayName: 'Veo 3.1', id: 'fal-ai/veo3.1' }],
          id: 'fal',
        },
      ] as any,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('regression: names the model, not "up to 0", when a model with no image support is dropped on', () => {
    useVideoStore.setState({
      model: 'fal-ai/veo3.1',
      parameters: { prompt: '' },
      parametersSchema: textOnlySchema,
      provider: 'fal',
      uploadingImagePreviews: [],
    } as any);

    const { result } = renderHook(() => useVideoReferenceUpload());

    expect(result.current.maxCount).toBe(0);

    const file = new File(['(binary)'], 'photo.png', { type: 'image/png' });
    act(() => {
      result.current.handleUploadFiles([file]);
    });

    expect(toast.warning).toHaveBeenCalledTimes(1);
    const [message] = (toast.warning as any).mock.calls[0];
    expect(message).toContain('config.imageUpload.notSupported');
    expect(message).toContain('Veo 3.1');
    expect(message).not.toContain('maxCountReached');
  });

  it('reports the real capacity for an image-capable model at capacity', () => {
    useVideoStore.setState({
      model: 'fal-ai/veo3.1',
      parameters: { imageUrl: 'existing.png', prompt: '' },
      parametersSchema: imageCapableSchema,
      provider: 'fal',
      uploadingImagePreviews: [],
    } as any);

    const { result } = renderHook(() => useVideoReferenceUpload());
    expect(result.current.maxCount).toBe(1);

    const file = new File(['(binary)'], 'photo.png', { type: 'image/png' });
    act(() => {
      result.current.handleUploadFiles([file]);
    });

    expect(toast.warning).toHaveBeenCalledTimes(1);
    const [message] = (toast.warning as any).mock.calls[0];
    expect(message).toContain('config.imageUpload.maxCountReached');
    expect(message).toContain('"count":1');
  });
});
