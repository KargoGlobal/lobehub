/**
 * Video Restyle — pure helpers (no React, no store) for fixing one existing
 * clip in place (wardrobe, props, overall look) instead of regenerating from
 * scratch. Endpoint ids and prices were verified against fal's live OpenAPI
 * schemas and model pages on 2026-09-12.
 */
import { type VideoGenerationRequest } from '@/store/video/slices/createVideo/action';

export type RestyleEngine = 'lucy' | 'kling';

export interface RestyleEngineSpec {
  description: string;
  id: RestyleEngine;
  label: string;
  model: string;
  /** USD per output second. */
  ratePerSecond: number;
  /** Whether this endpoint can optionally keep the source clip's audio. */
  supportsKeepAudio: boolean;
}

// `decart/lucy-edit/pro` restyles a clip in place with a single prompt; the
// live schema exposes only a 720p tier today (fal's pricing page also lists a
// 480p rate, but the endpoint does not accept it yet). `fal-ai/kling-video/
// o3/pro/video-to-video/edit` is prompt-driven too, with an opt-out audio
// passthrough.
export const RESTYLE_ENGINES: RestyleEngineSpec[] = [
  {
    description: 'Best for wardrobe, object and face swaps with maximum detail retention.',
    id: 'lucy',
    label: 'Lucy Edit [Pro]',
    model: 'decart/lucy-edit/pro',
    ratePerSecond: 0.15,
    supportsKeepAudio: false,
  },
  {
    description: 'Best for a full look restyle (e.g. claymation, anime) on 3-15s clips.',
    id: 'kling',
    label: 'Kling O3 Edit [Pro]',
    model: 'fal-ai/kling-video/o3/pro/video-to-video/edit',
    ratePerSecond: 0.168,
    supportsKeepAudio: true,
  },
];

export const getRestyleEngine = (id: RestyleEngine): RestyleEngineSpec =>
  RESTYLE_ENGINES.find((e) => e.id === id) ?? RESTYLE_ENGINES[0];

export const RESTYLE_CLIP_LENGTH_MIN_S = 3;
export const RESTYLE_CLIP_LENGTH_MAX_S = 30;
export const RESTYLE_CLIP_LENGTH_DEFAULT_S = 8;

export const formatUsd = (value: number): string =>
  value < 0.01 && value > 0 ? '<$0.01' : `$${value.toFixed(2)}`;

/**
 * Cost is billed per output second on both endpoints; `clipLengthSeconds` is
 * an estimate the user supplies (the true cost depends on the source clip's
 * own length, which the tool does not inspect).
 */
export const estimateRestyleCost = (engine: RestyleEngine, clipLengthSeconds: number): number =>
  getRestyleEngine(engine).ratePerSecond * Math.max(0, clipLengthSeconds);

export interface RestyleInput {
  engine: RestyleEngine;
  /** Kling only: keep the source clip's original audio. Defaults to true on fal's side. */
  keepAudio?: boolean;
  prompt: string;
  videoUrl: string;
}

export const buildRestyleRequest = (input: RestyleInput): VideoGenerationRequest => {
  const trimmedPrompt = input.prompt.trim();
  if (!trimmedPrompt) throw new Error('A prompt describing the edit is required');
  if (!input.videoUrl) throw new Error('A source clip is required to restyle');

  const spec = getRestyleEngine(input.engine);
  const params: Record<string, unknown> = {
    prompt: trimmedPrompt,
    videoUrl: input.videoUrl,
  };
  if (spec.supportsKeepAudio && input.keepAudio === false) {
    params.keepAudio = false;
  }

  return {
    model: spec.model,
    params: params as VideoGenerationRequest['params'],
    provider: 'fal',
  };
};
