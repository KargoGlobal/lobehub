import { LOBE_DEFAULT_MODEL_LIST } from 'model-bank';

import type { UsageReportCostInputRow } from '@/database/models/usageReport';

export interface PricingRule {
  kind: 'image' | 'megapixel' | 'second' | 'video';
  rate: number;
}

export type PricingIndex = Map<string, PricingRule>;

interface PricedModel {
  id: string;
  pricing?: { units?: { name?: string; rate?: number; unit?: string }[] };
}

const GENERATION_UNIT_NAMES = new Set(['imageGeneration', 'videoGeneration']);
const KINDS = new Set(['image', 'megapixel', 'second', 'video']);

export const buildPricingIndex = (
  models: readonly PricedModel[] = LOBE_DEFAULT_MODEL_LIST as unknown as PricedModel[],
): PricingIndex => {
  const index: PricingIndex = new Map();
  for (const m of models) {
    const unit = m.pricing?.units?.find(
      (u) =>
        u.name &&
        GENERATION_UNIT_NAMES.has(u.name) &&
        typeof u.rate === 'number' &&
        u.unit &&
        KINDS.has(u.unit),
    );
    if (unit)
      index.set(m.id, { kind: unit.unit as PricingRule['kind'], rate: unit.rate as number });
  }
  return index;
};

export interface CostEstimate {
  unpricedGenerations: number;
  usd: number;
}

export const estimateCost = (
  rows: UsageReportCostInputRow[],
  index: PricingIndex,
): CostEstimate => {
  let usd = 0;
  let unpricedGenerations = 0;
  for (const row of rows) {
    const rule = index.get(row.model);
    if (!rule) {
      unpricedGenerations += row.successCount;
      continue;
    }
    switch (rule.kind) {
      case 'image':
      case 'video': {
        usd += rule.rate * row.successCount;
        break;
      }
      case 'megapixel': {
        usd += rule.rate * (row.megapixels || row.successCount);
        break;
      }
      case 'second': {
        usd += rule.rate * row.seconds;
        break;
      }
    }
  }
  return { unpricedGenerations, usd: Math.round(usd * 10_000) / 10_000 };
};
