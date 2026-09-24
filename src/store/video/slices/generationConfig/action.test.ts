import { toast } from '@lobehub/ui/base-ui';
import { act, renderHook } from '@testing-library/react';
import {
  type AIVideoModelCard,
  extractVideoDefaultValues,
  type RuntimeVideoGenParams,
  type VideoModelParamsSchema,
} from 'model-bank';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useVideoStore } from '@/store/video';

vi.mock('@lobehub/ui/base-ui', () => ({
  toast: { warning: vi.fn() },
}));

vi.mock('i18next', () => ({
  t: (key: string, options?: Record<string, unknown>) =>
    `${key}${options ? `:${JSON.stringify(options)}` : ''}`,
}));

const modelASchema: VideoModelParamsSchema = {
  prompt: { default: '' },
  imageUrl: { default: '' },
  endImageUrl: { default: '' },
  duration: { default: 5, min: 1, max: 10 },
};

const modelBSchema: VideoModelParamsSchema = {
  prompt: { default: '' },
  imageUrl: { default: '' },
  endImageUrl: { default: '' },
  duration: { default: 3, min: 1, max: 10 },
};

const seedanceSchema: VideoModelParamsSchema = {
  prompt: { default: '' },
  imageUrls: { default: [], maxCount: 9 },
  endImageUrl: { default: null },
};

const minimaxH3Schema: VideoModelParamsSchema = {
  prompt: { default: '' },
  imageUrl: { default: null },
  imageUrls: { default: [], maxCount: 7 },
  endImageUrl: { default: null },
};

// A text-only schema with no image param at all (e.g. Veo before it was wired,
// or any future text-to-video-only endpoint).
const textOnlySchema: VideoModelParamsSchema = {
  prompt: { default: '' },
  duration: { default: 8, enum: [4, 6, 8] },
};

const testVideoModels: AIVideoModelCard[] = [
  {
    id: 'video-model-a',
    displayName: 'Video Model A',
    type: 'video',
    parameters: modelASchema,
    releasedAt: '2025-01-01',
  },
  {
    id: 'video-model-b',
    displayName: 'Video Model B',
    type: 'video',
    parameters: modelBSchema,
    releasedAt: '2025-01-02',
  },
  {
    id: 'seedance-2-0',
    displayName: 'Seedance 2.0',
    type: 'video',
    parameters: seedanceSchema,
    releasedAt: '2026-01-01',
  },
  {
    id: 'minimax-h3',
    displayName: 'MiniMax H3',
    type: 'video',
    parameters: minimaxH3Schema,
    releasedAt: '2026-07-31',
  },
  {
    id: 'text-only-model',
    displayName: 'Text Only Model',
    type: 'video',
    parameters: textOnlySchema,
    releasedAt: '2026-09-01',
  },
];

const mockProviders = [
  {
    id: 'provider-a',
    name: 'Provider A',
    children: [testVideoModels[0], testVideoModels[2], testVideoModels[4]],
  },
  {
    id: 'provider-b',
    name: 'Provider B',
    children: [testVideoModels[1], testVideoModels[3]],
  },
];

vi.mock('@/store/aiInfra', () => ({
  aiProviderSelectors: {
    enabledVideoModelList: vi.fn(() => mockProviders),
  },
  getAiInfraStoreState: vi.fn(() => ({})),
}));

const modelBDefaultValues = extractVideoDefaultValues(modelBSchema);

beforeEach(() => {
  vi.clearAllMocks();

  useVideoStore.setState({
    isInit: true,
    model: 'video-model-a',
    provider: 'provider-a',
    parametersSchema: modelASchema,
    parameters: {
      prompt: 'initial prompt',
      imageUrl: 'start-frame.png',
      endImageUrl: 'end-frame.png',
      duration: 6,
    } as RuntimeVideoGenParams,
    heldReferenceImage: null,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('video generationConfig actions', () => {
  it('should preserve prompt and frame images when switching model', () => {
    const { result } = renderHook(() => useVideoStore());

    act(() => {
      result.current.setParamOnInput('prompt', 'cinematic sunset');
      result.current.setParamOnInput('imageUrl', 'start-custom.png');
      result.current.setParamOnInput('endImageUrl', 'end-custom.png');
      result.current.setParamOnInput('duration', 8);
    });

    act(() => {
      result.current.setModelAndProviderOnSelect('video-model-b', 'provider-b');
    });

    expect(result.current.parameters).toEqual({
      ...modelBDefaultValues,
      prompt: 'cinematic sunset',
      imageUrl: 'start-custom.png',
      endImageUrl: 'end-custom.png',
    });
    expect(result.current.parameters?.duration).toBe(modelBDefaultValues.duration);
  });

  it('should clamp preserved reference images to the next model limit', () => {
    const imageUrls = Array.from({ length: 9 }, (_, index) => `reference-${index}.png`);
    useVideoStore.setState({
      model: 'seedance-2-0',
      parameters: {
        endImageUrl: 'end-frame.png',
        imageUrls,
        prompt: 'preserve references',
      } as RuntimeVideoGenParams,
      parametersSchema: seedanceSchema,
      provider: 'provider-a',
    });

    const { result } = renderHook(() => useVideoStore());

    act(() => {
      result.current.setModelAndProviderOnSelect('minimax-h3', 'provider-b');
    });

    expect(result.current.parameters).toEqual({
      endImageUrl: 'end-frame.png',
      imageUrl: null,
      imageUrls: imageUrls.slice(0, 7),
      prompt: 'preserve references',
    });
  });
});

describe('uploading image previews', () => {
  it('should append and remove in-flight upload previews', () => {
    const { result } = renderHook(() => useVideoStore());

    act(() => {
      useVideoStore.setState({ uploadingImagePreviews: [] });
    });

    act(() => {
      result.current.addUploadingImagePreviews(['blob:a', 'blob:b']);
    });
    expect(result.current.uploadingImagePreviews).toEqual(['blob:a', 'blob:b']);

    act(() => {
      result.current.addUploadingImagePreviews(['blob:c']);
    });
    expect(result.current.uploadingImagePreviews).toEqual(['blob:a', 'blob:b', 'blob:c']);

    act(() => {
      result.current.removeUploadingImagePreviews(['blob:a', 'blob:c']);
    });
    expect(result.current.uploadingImagePreviews).toEqual(['blob:b']);
  });
});

describe('reference image holding slot', () => {
  it('holds an uploaded frame and shows a notice when switching to a model with no image support', () => {
    const { result } = renderHook(() => useVideoStore());

    act(() => {
      result.current.setModelAndProviderOnSelect('text-only-model', 'provider-a');
    });

    expect(result.current.parameters?.imageUrl).toBeUndefined();
    expect(result.current.heldReferenceImage).toBe('start-frame.png');
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect((toast.warning as any).mock.calls[0][0]).toEqual(
      expect.objectContaining({
        description: expect.stringContaining('Text Only Model'),
      }),
    );
  });

  it('restores a held frame when switching back to an image-capable model, without re-notifying', () => {
    const { result } = renderHook(() => useVideoStore());

    act(() => {
      result.current.setModelAndProviderOnSelect('text-only-model', 'provider-a');
    });
    expect(result.current.heldReferenceImage).toBe('start-frame.png');

    act(() => {
      result.current.setModelAndProviderOnSelect('video-model-b', 'provider-b');
    });

    expect(result.current.parameters?.imageUrl).toBe('start-frame.png');
    expect(result.current.heldReferenceImage).toBeNull();
    // Only the hold transition notifies; restoring is a welcome surprise, not a warning.
    expect(toast.warning).toHaveBeenCalledTimes(1);
  });

  it('does not clobber a frame already carried over when a hold is pending and the model can take images again', () => {
    useVideoStore.setState({ heldReferenceImage: 'held.png' });

    const { result } = renderHook(() => useVideoStore());

    act(() => {
      result.current.setModelAndProviderOnSelect('video-model-b', 'provider-b');
    });

    // The active frame (already supported going into the switch) wins over the stale hold.
    expect(result.current.parameters?.imageUrl).toBe('start-frame.png');
    expect(result.current.heldReferenceImage).toBeNull();
  });

  it('keeps holding (without renotifying) across successive imageless models', () => {
    useVideoStore.setState({
      model: 'text-only-model',
      provider: 'provider-a',
      parametersSchema: textOnlySchema,
      parameters: { prompt: 'x' } as RuntimeVideoGenParams,
      heldReferenceImage: 'already-held.png',
    });

    const { result } = renderHook(() => useVideoStore());

    act(() => {
      // seedance-2-0 only supports imageUrls, still "no imageUrl" for this model, but
      // DOES support an image param overall, so this exercises restoring into imageUrls.
      result.current.setModelAndProviderOnSelect('seedance-2-0', 'provider-a');
    });

    expect(result.current.parameters?.imageUrls).toEqual(['already-held.png']);
    expect(result.current.heldReferenceImage).toBeNull();
    expect(toast.warning).not.toHaveBeenCalled();
  });
});
