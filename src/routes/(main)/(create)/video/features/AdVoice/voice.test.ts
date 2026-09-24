import { describe, expect, it } from 'vitest';

import {
  buildAvatarRequest,
  buildMusicRequest,
  buildPauseTag,
  buildSfxRequest,
  buildSpeechRequest,
  estimateAvatarCost,
  estimateMusicCost,
  estimateSpeechCost,
  estimateSpeechSeconds,
  formatUsd,
  insertPauseTag,
  isSyntheticPerformerBatch,
  SPEECH_ENGINES,
} from './voice';

describe('speech', () => {
  it('builds an ElevenLabs request and omits speed at the default', () => {
    const r = buildSpeechRequest('  Spring sale starts now.  ', 'elevenlabs', 'Rachel', 1);
    expect(r).toEqual({
      kind: 'speech',
      model: 'fal-ai/elevenlabs/tts/turbo-v2.5',
      params: {},
      provider: 'fal',
      text: 'Spring sale starts now.',
      voice: 'Rachel',
    });
  });

  it('clamps speed to the engine range', () => {
    expect(buildSpeechRequest('x', 'elevenlabs', 'Rachel', 3).params).toEqual({ speed: 1.2 });
    expect(buildSpeechRequest('x', 'minimax', 'Calm_Woman', 0.1).params).toEqual({ speed: 0.5 });
  });

  it('caps text at the engine limit', () => {
    const long = 'a'.repeat(6000);
    expect(buildSpeechRequest(long, 'elevenlabs', 'Rachel', 1).text).toHaveLength(5000);
  });

  it('estimates duration and cost', () => {
    const script = 'a'.repeat(840); // ~60s at 14 chars/s
    expect(estimateSpeechSeconds(script)).toBe(60);
    expect(estimateSpeechSeconds(script, 1.2)).toBe(50);
    expect(estimateSpeechSeconds('')).toBe(0);
    expect(estimateSpeechCost('a'.repeat(1000), 'elevenlabs')).toBeCloseTo(0.05);
    expect(estimateSpeechCost('a'.repeat(1000), 'minimax')).toBeCloseTo(0.1);
  });

  it('every engine lists at least one voice', () => {
    for (const e of SPEECH_ENGINES) expect(e.voices.length).toBeGreaterThan(0);
  });
});

describe('pause markup', () => {
  it('builds a 1s break tag by default', () => {
    expect(buildPauseTag()).toBe('<break time="1s" />');
    expect(buildPauseTag(2.5)).toBe('<break time="2.5s" />');
  });

  it('inserts the tag at the given cursor position', () => {
    const result = insertPauseTag('Hello world', 5);
    expect(result.text).toBe('Hello<break time="1s" /> world');
    expect(result.cursor).toBe(5 + buildPauseTag().length);
  });

  it('inserts at the end when the cursor is unknown', () => {
    const result = insertPauseTag('Hello', null);
    expect(result.text).toBe(`Hello${buildPauseTag()}`);
  });

  it('clamps an out-of-range cursor into the text bounds', () => {
    expect(insertPauseTag('Hi', -5).text).toBe(`${buildPauseTag()}Hi`);
    expect(insertPauseTag('Hi', 999).text).toBe(`Hi${buildPauseTag()}`);
  });
});

describe('music / sfx', () => {
  it('converts seconds to ms and clamps the length', () => {
    expect(buildMusicRequest('lofi', 15, true).params).toEqual({
      instrumental: true,
      lengthMs: 15_000,
    });
    expect(buildMusicRequest('lofi', 1, false).params.lengthMs).toBe(5000);
    expect(buildMusicRequest('lofi', 999, false).params.lengthMs).toBe(180_000);
  });

  it('bills music per started minute', () => {
    expect(estimateMusicCost(15)).toBeCloseTo(0.6);
    expect(estimateMusicCost(61)).toBeCloseTo(1.2);
  });

  it('builds a sound effect request with an optional clamped duration', () => {
    expect(buildSfxRequest('can opening').params).toEqual({});
    expect(buildSfxRequest('can opening', 40).params).toEqual({ durationSeconds: 22 });
    expect(buildSfxRequest('can opening', 0.1).params).toEqual({ durationSeconds: 0.5 });
  });
});

describe('avatar', () => {
  it('builds a talking-photo request with the disclosure marker', () => {
    const r = buildAvatarRequest({
      audioUrl: 'https://f/vo',
      imageUrl: 'https://f/face',
      label: 'Ad voice · Acme',
      mode: 'talkingPhoto',
      resolution: '720p',
    });
    expect(r.model).toBe('fal-ai/bytedance/omnihuman/v1.5');
    expect(r.provider).toBe('fal');
    expect(r.params).toEqual({
      audioUrl: 'https://f/vo',
      disclosure: 'synthetic_performer',
      imageUrl: 'https://f/face',
      prompt: 'Ad voice · Acme',
      resolution: '720p',
    });
  });

  it('builds a dub request and requires a clip', () => {
    const r = buildAvatarRequest({
      audioUrl: 'a',
      label: 'dub',
      mode: 'dubClip',
      resolution: '1080p',
      videoUrl: 'v',
    });
    expect(r.model).toBe('fal-ai/sync-lipsync/v3');
    expect(r.params).toMatchObject({
      audioUrl: 'a',
      disclosure: 'synthetic_performer',
      videoUrl: 'v',
    });
    expect(() =>
      buildAvatarRequest({ audioUrl: 'a', label: 'dub', mode: 'dubClip', resolution: '1080p' }),
    ).toThrow(/clip/);
    expect(() =>
      buildAvatarRequest({ audioUrl: 'a', label: 'x', mode: 'talkingPhoto', resolution: '1080p' }),
    ).toThrow(/photo/);
  });

  it('estimates cost per mode', () => {
    expect(estimateAvatarCost('talkingPhoto', 30)).toBeCloseTo(4.8);
    expect(estimateAvatarCost('dubClip', 30)).toBeCloseTo(4);
  });

  it('detects the disclosure marker on a batch config', () => {
    expect(isSyntheticPerformerBatch({ disclosure: 'synthetic_performer' })).toBe(true);
    expect(isSyntheticPerformerBatch({ prompt: 'x' })).toBe(false);
    expect(isSyntheticPerformerBatch(null)).toBe(false);
  });
});

describe('formatUsd', () => {
  it('formats cents and sub-cent amounts', () => {
    expect(formatUsd(4.8)).toBe('$4.80');
    expect(formatUsd(0.004)).toBe('<$0.01');
    expect(formatUsd(0)).toBe('$0.00');
  });
});
