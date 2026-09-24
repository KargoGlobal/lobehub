import type { Pricing } from 'model-bank';
import numeral from 'numeral';

/**
 * fal's per-megapixel image models (FLUX, Imagen, Qwen Image, Bria, ...) get an
 * exact-looking dollar figure computed at a 1MP reference size. Real output
 * usually isn't exactly 1MP, so that number quietly understates or overstates
 * the real charge — flag it so the copy can read as a floor ("from $x")
 * instead of a false-precise flat price.
 */
export const isMegapixelPricedUnit = (pricing?: Pricing): boolean =>
  (pricing?.units ?? []).some(
    (unit) => unit.name === 'imageGeneration' && unit.unit === 'megapixel',
  );

export type EstimatedCostPriceKind = 'image' | 'video';

export interface EstimatedCostLabelParams {
  approximatePricePerImage?: number;
  approximatePricePerVideo?: number;
  isMegapixelPriced?: boolean;
  priceKind?: EstimatedCostPriceKind;
  pricePerImage?: number;
  pricePerVideo?: number;
  t: (key: string, options?: Record<string, unknown>) => string;
}

/**
 * Formats the raw-USD "how much does this cost" line shown on a generation
 * model's price popover / detail panel: an honest "est. provider cost" for
 * flat per-output pricing, or "from $x / image (scales with size)" for
 * megapixel-priced models, since their real cost depends on output size.
 * Team-currency (credits) pricing is a separate, already-abstracted display
 * and isn't handled here.
 */
export const formatEstimatedCostLabel = ({
  approximatePricePerImage,
  approximatePricePerVideo,
  isMegapixelPriced = false,
  priceKind = 'image',
  pricePerImage,
  pricePerVideo,
  t,
}: EstimatedCostLabelParams): string | undefined => {
  const isVideo = priceKind === 'video';
  const exactUsd = isVideo ? pricePerVideo : pricePerImage;
  const approxUsd = isVideo ? approximatePricePerVideo : approximatePricePerImage;
  const usd = typeof exactUsd === 'number' ? exactUsd : approxUsd;

  if (typeof usd !== 'number') return undefined;

  const amount = numeral(usd).format('0,0.00[000]');

  if (!isVideo && isMegapixelPriced) {
    return t('GenerationModelItem.estimatedCostFromPerImage', {
      amount,
      defaultValue: `from $${amount} / image (scales with size)`,
    });
  }

  return t(
    isVideo
      ? 'GenerationModelItem.estimatedCostPerVideo'
      : 'GenerationModelItem.estimatedCostPerImage',
    {
      amount,
      defaultValue: isVideo
        ? `est. provider cost: $${amount} / video second`
        : `est. provider cost: $${amount} / image`,
    },
  );
};
