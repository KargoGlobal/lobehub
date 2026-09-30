// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { buildPricingIndex, estimateCost } from './pricing';

const models = [
  {
    id: 'm/flat',
    pricing: { units: [{ name: 'imageGeneration', rate: 0.05, strategy: 'fixed', unit: 'image' }] },
  },
  {
    id: 'm/mp',
    pricing: {
      units: [{ name: 'imageGeneration', rate: 0.03, strategy: 'fixed', unit: 'megapixel' }],
    },
  },
  {
    id: 'm/sec',
    pricing: { units: [{ name: 'videoGeneration', rate: 0.4, strategy: 'fixed', unit: 'second' }] },
  },
  {
    id: 'm/vid',
    pricing: { units: [{ name: 'videoGeneration', rate: 1.5, strategy: 'fixed', unit: 'video' }] },
  },
  { id: 'm/none' },
];

describe('buildPricingIndex', () => {
  it('maps generation units to rules and skips models without pricing', () => {
    const idx = buildPricingIndex(models);
    expect(idx.get('m/flat')).toEqual({ kind: 'image', rate: 0.05 });
    expect(idx.get('m/mp')).toEqual({ kind: 'megapixel', rate: 0.03 });
    expect(idx.get('m/sec')).toEqual({ kind: 'second', rate: 0.4 });
    expect(idx.get('m/vid')).toEqual({ kind: 'video', rate: 1.5 });
    expect(idx.has('m/none')).toBe(false);
  });

  it('defaults to the real model bank', () => {
    const idx = buildPricingIndex();
    expect(idx.size).toBeGreaterThan(0);
    // `fal-ai/veo3.1`'s videoGeneration unit is per-second at 0.4 USD
    // (packages/model-bank/src/aiModels/fal.ts).
    expect(idx.get('fal-ai/veo3.1')).toEqual({ kind: 'second', rate: 0.4 });
  });
});

describe('estimateCost', () => {
  const idx = buildPricingIndex(models);
  const row = (o: Partial<Parameters<typeof estimateCost>[0][number]>) => ({
    megapixels: 0,
    mediaType: 'image' as const,
    model: 'm/flat',
    seconds: 0,
    successCount: 1,
    userId: 'u',
    ...o,
  });

  it('prices flat, megapixel, per-second and per-video rows', () => {
    expect(estimateCost([row({ successCount: 3 })], idx)).toEqual({
      unpricedGenerations: 0,
      usd: 0.15,
    });
    expect(estimateCost([row({ megapixels: 2.5, model: 'm/mp', successCount: 2 })], idx).usd).toBe(
      0.075,
    );
    expect(estimateCost([row({ mediaType: 'video', model: 'm/sec', seconds: 8 })], idx).usd).toBe(
      3.2,
    );
    expect(
      estimateCost([row({ mediaType: 'video', model: 'm/vid', successCount: 2 })], idx).usd,
    ).toBe(3);
  });

  it('falls back to 1MP per generation when dimensions are unknown', () => {
    expect(estimateCost([row({ megapixels: 0, model: 'm/mp', successCount: 4 })], idx).usd).toBe(
      0.12,
    );
  });

  it('counts unpriced generations', () => {
    expect(estimateCost([row({ model: 'm/none', successCount: 5 }), row({})], idx)).toEqual({
      unpricedGenerations: 5,
      usd: 0.05,
    });
  });
});
