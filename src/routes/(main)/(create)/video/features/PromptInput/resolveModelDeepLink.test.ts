import { describe, expect, it } from 'vitest';

import { resolveVideoModelDeepLink } from './resolveModelDeepLink';

const enabledModelList = [
  { children: [{ id: 'fal-ai/veo3.1' }, { id: 'fal-ai/veo3.1/fast' }], id: 'fal' },
  { children: [{ id: 'minimax/h3-max' }], id: 'fal' },
];

describe('resolveVideoModelDeepLink', () => {
  it('switches when the requested model is enabled', () => {
    const result = resolveVideoModelDeepLink({
      currentModelSupportsImage: false,
      enabledModelList,
      hasPendingImage: true,
      targetModelId: 'minimax/h3-max',
    });

    expect(result).toEqual({ providerId: 'fal', type: 'switch' });
  });

  it('falls back silently when the requested model is unavailable and there is no pending image', () => {
    const result = resolveVideoModelDeepLink({
      currentModelSupportsImage: false,
      enabledModelList,
      hasPendingImage: false,
      targetModelId: 'not-a-real-model',
    });

    expect(result).toEqual({ type: 'fallback' });
  });

  it('falls back when the requested model is unavailable but the current model can still take the pending image', () => {
    const result = resolveVideoModelDeepLink({
      currentModelSupportsImage: true,
      enabledModelList,
      hasPendingImage: true,
      targetModelId: 'not-a-real-model',
    });

    expect(result).toEqual({ type: 'fallback' });
  });

  it('errors instead of silently losing the image when neither the requested nor current model can take it', () => {
    const result = resolveVideoModelDeepLink({
      currentModelSupportsImage: false,
      enabledModelList,
      hasPendingImage: true,
      targetModelId: 'not-a-real-model',
    });

    expect(result).toEqual({ type: 'error' });
  });
});
