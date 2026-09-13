/**
 * Ad Voice — pure helpers (no React, no store) for the voiceover / music /
 * sound-effect / talking-performer tool. Endpoint ids, limits and prices were
 * verified against fal's live OpenAPI schemas and model pages on 2026-09-12.
 */
import { SYNTHETIC_PERFORMER_DISCLOSURE } from '@lobechat/types';

import { type VideoGenerationRequest } from '@/store/video/slices/createVideo/action';

export type SpeechEngine = 'elevenlabs' | 'minimax';

export interface SpeechEngineSpec {
  id: SpeechEngine;
  label: string;
  maxChars: number;
  model: string;
  /** USD per 1,000 characters. */
  ratePerKChar: number;
  speed: { default: number; max: number; min: number };
  voices: { label: string; value: string }[];
}

// ElevenLabs' stock library voices, addressed by name (the fal endpoint's
// `voice` field defaults to "Rachel"). MiniMax voices are the endpoint's own
// `voice_id` enum.
export const SPEECH_ENGINES: SpeechEngineSpec[] = [
  {
    id: 'elevenlabs',
    label: 'ElevenLabs Turbo v2.5',
    maxChars: 5000,
    model: 'fal-ai/elevenlabs/tts/turbo-v2.5',
    ratePerKChar: 0.05,
    speed: { default: 1, max: 1.2, min: 0.7 },
    voices: [
      { label: 'Rachel — calm, narration', value: 'Rachel' },
      { label: 'Sarah — soft, warm', value: 'Sarah' },
      { label: 'Laura — upbeat, social', value: 'Laura' },
      { label: 'Charlotte — confident, seductive', value: 'Charlotte' },
      { label: 'Alice — clear, British', value: 'Alice' },
      { label: 'Matilda — friendly, warm', value: 'Matilda' },
      { label: 'Jessica — expressive, playful', value: 'Jessica' },
      { label: 'Lily — warm, British', value: 'Lily' },
      { label: 'Roger — confident, laid-back', value: 'Roger' },
      { label: 'Charlie — natural, Australian', value: 'Charlie' },
      { label: 'George — warm, British storyteller', value: 'George' },
      { label: 'Callum — intense, transatlantic', value: 'Callum' },
      { label: 'Liam — articulate, energetic', value: 'Liam' },
      { label: 'Will — friendly, relaxed', value: 'Will' },
      { label: 'Eric — friendly, conversational', value: 'Eric' },
      { label: 'Chris — casual, natural', value: 'Chris' },
      { label: 'Brian — deep, narration', value: 'Brian' },
      { label: 'Daniel — authoritative, British', value: 'Daniel' },
      { label: 'Bill — trustworthy, mature', value: 'Bill' },
    ],
  },
  {
    id: 'minimax',
    label: 'MiniMax Speech 2.8 HD',
    maxChars: 5000,
    model: 'fal-ai/minimax/speech-2.8-hd',
    ratePerKChar: 0.1,
    speed: { default: 1, max: 2, min: 0.5 },
    voices: [
      { label: 'Wise Woman', value: 'Wise_Woman' },
      { label: 'Friendly Person', value: 'Friendly_Person' },
      { label: 'Inspirational Girl', value: 'Inspirational_girl' },
      { label: 'Deep Voice Man', value: 'Deep_Voice_Man' },
      { label: 'Calm Woman', value: 'Calm_Woman' },
      { label: 'Casual Guy', value: 'Casual_Guy' },
      { label: 'Lively Girl', value: 'Lively_Girl' },
      { label: 'Patient Man', value: 'Patient_Man' },
      { label: 'Young Knight', value: 'Young_Knight' },
      { label: 'Determined Man', value: 'Determined_Man' },
      { label: 'Lovely Girl', value: 'Lovely_Girl' },
      { label: 'Decent Boy', value: 'Decent_Boy' },
      { label: 'Imposing Manner', value: 'Imposing_Manner' },
      { label: 'Elegant Man', value: 'Elegant_Man' },
      { label: 'Abbess', value: 'Abbess' },
      { label: 'Sweet Girl', value: 'Sweet_Girl_2' },
      { label: 'Exuberant Girl', value: 'Exuberant_Girl' },
    ],
  },
];

export const getSpeechEngine = (id: SpeechEngine): SpeechEngineSpec =>
  SPEECH_ENGINES.find((e) => e.id === id) ?? SPEECH_ENGINES[0];

export const MUSIC_MODEL = 'fal-ai/elevenlabs/music';
export const MUSIC_RATE_PER_MINUTE = 0.6; // rounded up to the next minute
export const MUSIC_LENGTH_MIN_S = 5;
export const MUSIC_LENGTH_MAX_S = 180;
export const MUSIC_LENGTH_DEFAULT_S = 15;

export const SFX_MODEL = 'fal-ai/elevenlabs/sound-effects/v2';
export const SFX_RATE_PER_SECOND = 0.002;
export const SFX_MAX_CHARS = 450;
export const SFX_DURATION_MIN_S = 0.5;
export const SFX_DURATION_MAX_S = 22;

export const OMNIHUMAN_MODEL = 'fal-ai/bytedance/omnihuman/v1.5';
export const OMNIHUMAN_RATE_PER_SECOND = 0.16;
export const LIPSYNC_MODEL = 'fal-ai/sync-lipsync/v3';
export const LIPSYNC_RATE_PER_MINUTE = 8;
/** OmniHuman audio caps per resolution (fal docs). */
export const OMNIHUMAN_MAX_AUDIO_S: Record<AvatarResolution, number> = {
  '720p': 60,
  '1080p': 30,
};

export type AvatarResolution = '720p' | '1080p';
export type AvatarMode = 'talkingPhoto' | 'dubClip';

/** Roughly 150 words/min, ~5.5 chars per word incl. space → ~14 chars/s. */
export const estimateSpeechSeconds = (text: string, speed = 1): number => {
  const chars = text.trim().length;
  if (chars === 0) return 0;
  return Math.max(1, Math.round(chars / 14 / speed));
};

export const estimateSpeechCost = (text: string, engine: SpeechEngine): number => {
  const spec = getSpeechEngine(engine);
  return (text.length / 1000) * spec.ratePerKChar;
};

export const estimateMusicCost = (lengthSeconds: number): number =>
  Math.max(1, Math.ceil(lengthSeconds / 60)) * MUSIC_RATE_PER_MINUTE;

export const estimateSfxCost = (durationSeconds: number | undefined): number =>
  (durationSeconds ?? 10) * SFX_RATE_PER_SECOND;

export const estimateAvatarCost = (mode: AvatarMode, audioSeconds: number): number =>
  mode === 'dubClip'
    ? (audioSeconds / 60) * LIPSYNC_RATE_PER_MINUTE
    : audioSeconds * OMNIHUMAN_RATE_PER_SECOND;

export const formatUsd = (value: number): string =>
  value < 0.01 && value > 0 ? '<$0.01' : `$${value.toFixed(2)}`;

export interface SpeechRequest {
  kind: 'speech';
  model: string;
  params: { speed?: number };
  provider: 'fal';
  text: string;
  voice: string;
}

export const buildSpeechRequest = (
  text: string,
  engine: SpeechEngine,
  voice: string,
  speed: number,
): SpeechRequest => {
  const spec = getSpeechEngine(engine);
  const clampedSpeed = Math.min(spec.speed.max, Math.max(spec.speed.min, speed));
  return {
    kind: 'speech',
    model: spec.model,
    params: clampedSpeed === 1 ? {} : { speed: Number(clampedSpeed.toFixed(2)) },
    provider: 'fal',
    text: text.trim().slice(0, spec.maxChars),
    voice,
  };
};

export const buildMusicRequest = (prompt: string, lengthSeconds: number, instrumental: boolean) => {
  const clamped = Math.min(
    MUSIC_LENGTH_MAX_S,
    Math.max(MUSIC_LENGTH_MIN_S, Math.round(lengthSeconds)),
  );
  return {
    kind: 'music' as const,
    model: MUSIC_MODEL,
    params: { instrumental, lengthMs: clamped * 1000 },
    provider: 'fal' as const,
    text: prompt.trim(),
  };
};

export const buildSfxRequest = (text: string, durationSeconds?: number) => {
  const params: { durationSeconds?: number } = {};
  if (typeof durationSeconds === 'number' && Number.isFinite(durationSeconds)) {
    params.durationSeconds = Math.min(
      SFX_DURATION_MAX_S,
      Math.max(SFX_DURATION_MIN_S, Number(durationSeconds.toFixed(1))),
    );
  }
  return {
    kind: 'sfx' as const,
    model: SFX_MODEL,
    params,
    provider: 'fal' as const,
    text: text.trim().slice(0, SFX_MAX_CHARS),
  };
};

export interface AvatarInput {
  audioUrl: string;
  /** Talking photo: the performer's still. */
  imageUrl?: string;
  /** Label shown on the batch; the endpoint treats it as optional guidance. */
  label: string;
  mode: AvatarMode;
  resolution: AvatarResolution;
  /** Dub a clip: the source video. */
  videoUrl?: string;
}

/**
 * Both avatar endpoints go through the ordinary video pipeline (queue + poll +
 * ffmpeg post-process). The disclosure marker rides in the batch config so the
 * feed can badge it and export can stamp it — it is not optional.
 */
export const buildAvatarRequest = (input: AvatarInput): VideoGenerationRequest => {
  if (input.mode === 'dubClip') {
    if (!input.videoUrl) throw new Error('A source clip is required to dub');
    return {
      model: LIPSYNC_MODEL,
      params: {
        audioUrl: input.audioUrl,
        disclosure: SYNTHETIC_PERFORMER_DISCLOSURE,
        prompt: input.label,
        videoUrl: input.videoUrl,
      } as VideoGenerationRequest['params'],
      provider: 'fal',
    };
  }
  if (!input.imageUrl) throw new Error('A performer photo is required');
  return {
    model: OMNIHUMAN_MODEL,
    params: {
      audioUrl: input.audioUrl,
      disclosure: SYNTHETIC_PERFORMER_DISCLOSURE,
      imageUrl: input.imageUrl,
      prompt: input.label,
      resolution: input.resolution,
    } as VideoGenerationRequest['params'],
    provider: 'fal',
  };
};

export const isSyntheticPerformerBatch = (config: unknown): boolean =>
  !!config &&
  typeof config === 'object' &&
  (config as { disclosure?: unknown }).disclosure === SYNTHETIC_PERFORMER_DISCLOSURE;
