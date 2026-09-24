import type { Pricing } from 'model-bank';
import { describe, expect, it } from 'vitest';

import { formatEstimatedCostLabel, isMegapixelPricedUnit } from './generationModelPricing';

const t = ((key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key) as (
  key: string,
  options?: Record<string, unknown>,
) => string;

describe('isMegapixelPricedUnit', () => {
  it('is true for a per-megapixel imageGeneration unit', () => {
    const pricing: Pricing = {
      units: [{ name: 'imageGeneration', rate: 0.025, strategy: 'fixed', unit: 'megapixel' }],
    };
    expect(isMegapixelPricedUnit(pricing)).toBe(true);
  });

  it('is false for a flat per-image unit', () => {
    const pricing: Pricing = {
      units: [{ name: 'imageGeneration', rate: 0.07, strategy: 'fixed', unit: 'image' }],
    };
    expect(isMegapixelPricedUnit(pricing)).toBe(false);
  });

  it('is false when pricing is missing', () => {
    expect(isMegapixelPricedUnit(undefined)).toBe(false);
  });
});

describe('formatEstimatedCostLabel', () => {
  it('labels a flat per-image price as an estimated provider cost', () => {
    expect(formatEstimatedCostLabel({ pricePerImage: 0.07, t })).toBe(
      'est. provider cost: $0.07 / image',
    );
  });

  it('falls back to the approximate price when no exact price is given', () => {
    expect(formatEstimatedCostLabel({ approximatePricePerImage: 0.067, t })).toBe(
      'est. provider cost: $0.067 / image',
    );
  });

  it('labels a per-video price with a flat "/ video" suffix (approximatePricePerVideo/pricePerVideo are already whole-video fallback prices, not per-second rates)', () => {
    expect(formatEstimatedCostLabel({ priceKind: 'video', pricePerVideo: 0.4, t })).toBe(
      'est. provider cost: $0.40 / video',
    );
  });

  it('labels a megapixel-priced image model as a floor, not a flat number', () => {
    expect(
      formatEstimatedCostLabel({
        isMegapixelPriced: true,
        pricePerImage: 0.025 * ((1024 * 1024) / 1_000_000),
        t,
      }),
    ).toBe('from $0.02621 / image (scales with size)');
  });

  it('never applies the megapixel floor phrasing to video pricing', () => {
    expect(
      formatEstimatedCostLabel({
        isMegapixelPriced: true,
        priceKind: 'video',
        pricePerVideo: 0.4,
        t,
      }),
    ).toBe('est. provider cost: $0.40 / video');
  });

  it('returns undefined when no price is available', () => {
    expect(formatEstimatedCostLabel({ t })).toBeUndefined();
  });
});
