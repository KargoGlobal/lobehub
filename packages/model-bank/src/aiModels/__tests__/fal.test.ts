import { describe, expect, it } from 'vitest';

import { allModels } from '../fal';

describe('fal model-bank', () => {
  it('includes background removal and upscale utility models, disabled by default', () => {
    const birefnet = allModels.find((m) => m.id === 'fal-ai/birefnet/v2');
    const upscale = allModels.find((m) => m.id === 'bria/increase-resolution');

    expect(birefnet).toMatchObject({
      enabled: false,
      parameters: { imageUrl: { default: null } },
      type: 'image',
    });
    expect(upscale).toMatchObject({
      enabled: false,
      parameters: { imageUrl: { default: null } },
      type: 'image',
    });
  });
});
