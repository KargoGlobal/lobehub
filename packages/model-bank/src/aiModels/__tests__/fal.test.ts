import { describe, expect, it } from 'vitest';

import { type AIImageModelCard } from '../../types/aiModel';
import { allModels } from '../fal';

const isImageCard = (id: string): AIImageModelCard | undefined =>
  allModels.find((m): m is AIImageModelCard => m.type === 'image' && m.id === id);

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

  it('includes the typography tool models, disabled by default and text-to-image only', () => {
    const ideogram = isImageCard('ideogram/v4');
    const recraft = isImageCard('fal-ai/recraft/v4/pro/text-to-vector');

    expect(ideogram).toMatchObject({
      enabled: false,
      parameters: { prompt: { default: '' } },
      type: 'image',
    });
    expect(ideogram?.parameters).not.toHaveProperty('imageUrl');

    expect(recraft).toMatchObject({
      enabled: false,
      parameters: { prompt: { default: '' } },
      type: 'image',
    });
    expect(recraft?.parameters).not.toHaveProperty('imageUrl');
  });

  it('gives GPT Image 2 a landscape-default aspectRatio mapped to its own presets', () => {
    const gptImage2 = isImageCard('openai/gpt-image-2');

    expect(gptImage2?.parameters).toMatchObject({
      aspectRatio: {
        default: '16:9',
        enum: ['1:1', '16:9', '9:16', '4:3', '3:4'],
      },
    });
  });

  it('gives Nano Banana 2 a landscape-default aspectRatio matching its fal-accepted enum', () => {
    const nanoBanana2 = isImageCard('fal-ai/nano-banana-2');

    expect(nanoBanana2?.parameters).toMatchObject({
      aspectRatio: {
        default: '16:9',
        enum: [
          'auto',
          '1:1',
          '2:3',
          '3:2',
          '3:4',
          '4:3',
          '4:5',
          '5:4',
          '9:16',
          '16:9',
          '21:9',
          '1:4',
          '4:1',
          '1:8',
          '8:1',
        ],
      },
    });
  });
});
