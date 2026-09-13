import { describe, expect, it } from 'vitest';

import {
  buildRestyleRequest,
  estimateRestyleCost,
  formatUsd,
  getRestyleEngine,
  RESTYLE_ENGINES,
} from './restyle';

describe('engines', () => {
  it('lists Lucy Edit [Pro] and Kling O3 Edit [Pro]', () => {
    expect(RESTYLE_ENGINES.map((e) => e.id)).toEqual(['lucy', 'kling']);
  });

  it('falls back to the first engine for an unknown id', () => {
    expect(getRestyleEngine('bogus' as any)).toBe(RESTYLE_ENGINES[0]);
  });
});

describe('estimateRestyleCost', () => {
  it('bills per second at each engine rate', () => {
    expect(estimateRestyleCost('lucy', 10)).toBeCloseTo(1.5);
    expect(estimateRestyleCost('kling', 10)).toBeCloseTo(1.68);
  });

  it('never goes negative', () => {
    expect(estimateRestyleCost('lucy', -5)).toBe(0);
  });
});

describe('buildRestyleRequest', () => {
  it('builds a Lucy Edit request with videoUrl as an extra param', () => {
    const r = buildRestyleRequest({
      engine: 'lucy',
      prompt: '  Swap the jacket for a red one  ',
      videoUrl: 'https://cdn/clip.mp4',
    });
    expect(r).toEqual({
      model: 'decart/lucy-edit/pro',
      params: { prompt: 'Swap the jacket for a red one', videoUrl: 'https://cdn/clip.mp4' },
      provider: 'fal',
    });
  });

  it('builds a Kling request and forwards keepAudio only when turned off', () => {
    const withDefault = buildRestyleRequest({
      engine: 'kling',
      prompt: 'Restyle as claymation',
      videoUrl: 'https://cdn/clip.mp4',
    });
    expect(withDefault.params).toEqual({
      prompt: 'Restyle as claymation',
      videoUrl: 'https://cdn/clip.mp4',
    });

    const keepAudioOff = buildRestyleRequest({
      engine: 'kling',
      keepAudio: false,
      prompt: 'Restyle as claymation',
      videoUrl: 'https://cdn/clip.mp4',
    });
    expect(keepAudioOff.params).toEqual({
      keepAudio: false,
      prompt: 'Restyle as claymation',
      videoUrl: 'https://cdn/clip.mp4',
    });
  });

  it('ignores keepAudio on Lucy Edit (not supported)', () => {
    const r = buildRestyleRequest({
      engine: 'lucy',
      keepAudio: false,
      prompt: 'x',
      videoUrl: 'https://cdn/clip.mp4',
    });
    expect('keepAudio' in (r.params as object)).toBe(false);
  });

  it('requires a non-empty prompt', () => {
    expect(() =>
      buildRestyleRequest({ engine: 'lucy', prompt: '   ', videoUrl: 'https://cdn/clip.mp4' }),
    ).toThrow(/prompt/);
  });

  it('requires a source clip', () => {
    expect(() => buildRestyleRequest({ engine: 'lucy', prompt: 'x', videoUrl: '' })).toThrow(
      /clip/,
    );
  });
});

describe('formatUsd', () => {
  it('formats cents and sub-cent amounts', () => {
    expect(formatUsd(1.5)).toBe('$1.50');
    expect(formatUsd(0.004)).toBe('<$0.01');
    expect(formatUsd(0)).toBe('$0.00');
  });
});
