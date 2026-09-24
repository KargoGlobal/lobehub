import { describe, expect, it } from 'vitest';

import { describeDurationSupport, getLongerCutHintRange } from './durationSupport';

describe('describeDurationSupport', () => {
  it('classifies an enum schema (Veo) and flags it for the longer-cut hint', () => {
    const result = describeDurationSupport({ default: 8, enum: [4, 6, 8] });

    expect(result).toEqual({ kind: 'enum', max: 8, min: 4, needsLongerCutHint: true });
  });

  it('does not flag an enum schema that already reaches the platform ceiling', () => {
    const result = describeDurationSupport({ default: 15, enum: [5, 10, 15] });

    expect(result.needsLongerCutHint).toBe(false);
  });

  it('classifies a range schema (H3 Max) with presets clamped to its bounds', () => {
    const result = describeDurationSupport({ default: 8, max: 15, min: 5 });

    expect(result).toEqual({
      kind: 'range',
      max: 15,
      min: 5,
      needsLongerCutHint: false,
      presetTicks: [6, 10, 15],
    });
  });

  it('drops preset ticks outside a narrower range', () => {
    const result = describeDurationSupport({ default: 6, max: 8, min: 4 });

    expect(result.presetTicks).toEqual([6]);
  });
});

describe('getLongerCutHintRange', () => {
  it('offers the next tick past the current enum max through the target model max', () => {
    // Veo (max 8) -> MiniMax H3 Max (5-15): "Need 10 to 15s?"
    expect(getLongerCutHintRange(8, 5, 15)).toEqual({ lower: 10, upper: 15 });
  });

  it('falls back to the target model min when no preset tick clears the current max', () => {
    expect(getLongerCutHintRange(20, 21, 30)).toEqual({ lower: 21, upper: 30 });
  });
});
