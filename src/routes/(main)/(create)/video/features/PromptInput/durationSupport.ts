/** Structural shape of a video model's `duration` param schema. */
interface DurationParamSchema {
  default: number;
  enum?: number[];
  max?: number;
  min?: number;
}

export interface DurationSupportInfo {
  /** `enum`: a fixed set of choices (Veo's 4/6/8s). `range`: a continuous slider (H3's 5-15s). */
  kind: 'enum' | 'range';
  max: number;
  min: number;
  /** True for an enum model whose max is below the platform ceiling (15s) — there's a longer option elsewhere. */
  needsLongerCutHint: boolean;
  /** For a range model: the min/max/step-appropriate preset ticks to show on the slider. */
  presetTicks?: number[];
}

/** Duration presets surfaced as slider ticks for range models, and as the
 * candidate lower bound for the "need longer?" hint on enum models. */
export const DURATION_PRESET_TICKS = [6, 10, 15];

/** The current single-shot ceiling across every wired video model (MiniMax H3 Max). */
export const DURATION_PLATFORM_CEILING = 15;

/**
 * Classifies a video model's duration schema for the popover UI: whether it's
 * an enum (segmented control) or a range (slider + presets), its bounds, and
 * whether an enum model should point users toward a longer-duration model.
 */
export function describeDurationSupport(schema: DurationParamSchema): DurationSupportInfo {
  if (schema.enum && schema.enum.length > 0) {
    const min = Math.min(...schema.enum);
    const max = Math.max(...schema.enum);
    return { kind: 'enum', max, min, needsLongerCutHint: max < DURATION_PLATFORM_CEILING };
  }

  const min = schema.min ?? schema.default;
  const max = schema.max ?? schema.default;
  const presetTicks = DURATION_PRESET_TICKS.filter((tick) => tick >= min && tick <= max);

  return { kind: 'range', max, min, needsLongerCutHint: false, presetTicks };
}

/**
 * The range to advertise in the "Need Ns to Ns? {{model}} supports it" hint:
 * the lower bound is the first preset tick past what the current (enum)
 * model already covers, so the pitch is for genuinely unreachable durations;
 * the upper bound is the target model's own max.
 */
export function getLongerCutHintRange(
  currentMax: number,
  targetMin: number,
  targetMax: number,
): { lower: number; upper: number } {
  const lower = DURATION_PRESET_TICKS.find((tick) => tick > currentMax) ?? targetMin;
  return { lower, upper: targetMax };
}
