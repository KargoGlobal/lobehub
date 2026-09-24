import { fal } from '@fal-ai/client';
import debug from 'debug';
import { pick } from 'es-toolkit/compat';
import type { RuntimeImageGenParamsValue } from 'model-bank';
import type { ClientOptions } from 'openai';

import type { LobeRuntimeAI } from '../../core/BaseAI';
import { AgentRuntimeErrorType } from '../../types/error';
import type { CreateImagePayload, CreateImageResponse } from '../../types/image';
import type { TextToSpeechPayload } from '../../types/tts';
import type {
  CreateVideoPayload,
  CreateVideoResponse,
  HandleCreateVideoWebhookPayload,
  HandleCreateVideoWebhookResult,
  PollVideoStatusResult,
} from '../../types/video';
import { AgentRuntimeError } from '../../utils/createError';
import type { ModelIdMappingOptions } from '../../utils/modelIdMapping';
import { resolveMappedModelId } from '../../utils/modelIdMapping';

// Create debug logger
const log = debug('lobe-image:fal');

// fal hosts models under vendor namespaces (e.g. `openai/gpt-image-2`); only
// bare model ids get the default `fal-ai/` prefix. `ideogram/` covers the V4 typography line,
// which fal moved out of the legacy `fal-ai/ideogram/v2` / `fal-ai/ideogram/v3` namespace
// (verified on the live fal OpenAPI schema 2026-09-12 — `fal-ai/ideogram/v4` 404s, `ideogram/v4`
// is the real endpoint id).
const FAL_ENDPOINT_NAMESPACES = ['fal-ai/', 'openai/', 'bria/', 'minimax/', 'decart/', 'ideogram/'];
const resolveFalEndpoint = (model: string) =>
  FAL_ENDPOINT_NAMESPACES.some((ns) => model.startsWith(ns)) ? model : `fal-ai/${model}`;

// MiniMax H3 family on fal (`minimax/h3`, `minimax/h3-max`). These endpoints
// differ from the Veo-style ones: duration is an integer, the text-to-video and
// image-to-video variants are separate endpoints, and they accept a start/end
// frame pair plus a `prompt_expansion_mode`.
const isFalH3Endpoint = (endpoint: string) => /^minimax\/h3(?:-max)?(?:\/|$)/.test(endpoint);

// Veo 3.1 / Veo 3.1 Fast on fal. Text-to-video and image-to-video are separate
// endpoints, same as H3 above; unlike H3, the image-to-video variant still takes
// `aspect_ratio`, but only the "auto" value (fal derives the real ratio from the
// attached frame — verified against the live fal OpenAPI schema 2026-09-23).
const isFalVeoEndpoint = (endpoint: string) => /^fal-ai\/veo3\.1(?:\/fast)?$/.test(endpoint);

const buildFalVeoVideoInput = (
  endpoint: string,
  params: CreateVideoPayload['params'],
): { endpoint: string; input: Record<string, unknown> } => {
  const hasImage = typeof params.imageUrl === 'string' && params.imageUrl.length > 0;
  const resolvedEndpoint = hasImage ? `${endpoint}/image-to-video` : endpoint;

  const input: Record<string, unknown> = { prompt: params.prompt };
  if (hasImage) {
    input.image_url = params.imageUrl;
    input.aspect_ratio = 'auto';
  } else if (params.aspectRatio) {
    input.aspect_ratio = params.aspectRatio;
  }
  // fal video endpoints take duration as an enum string like "8s"
  if (params.duration) input.duration = `${params.duration}s`;
  if (params.resolution) input.resolution = params.resolution;
  if (params.seed !== null && params.seed !== undefined) input.seed = params.seed;

  return { endpoint: resolvedEndpoint, input };
};
const H3_DURATION_MIN = 5;
const H3_DURATION_MAX = 15;
const H3_PROMPT_EXPANSION_MODES = new Set(['balanced', 'quality']);
const H3_REFERENCE_PROMPT_EXPANSION_MODES = new Set(['fast', 'balanced', 'quality']);
const H3_MAX_REFERENCE_IMAGES = 9;

const clampH3Duration = (duration: unknown): number | undefined => {
  if (typeof duration !== 'number' || !Number.isFinite(duration)) return undefined;
  return Math.min(H3_DURATION_MAX, Math.max(H3_DURATION_MIN, Math.round(duration)));
};

// `minimax/h3/reference-to-video`: the product photo(s) are subject references
// ("Image 1"...) rather than the literal first frame.
const buildFalH3ReferenceInput = (
  params: CreateVideoPayload['params'],
): Record<string, unknown> => {
  const input: Record<string, unknown> = { prompt: params.prompt };
  const duration = clampH3Duration(params.duration);
  if (duration !== undefined) input.duration = duration;
  if (params.resolution) input.resolution = String(params.resolution).toUpperCase();
  if (params.aspectRatio) input.aspect_ratio = params.aspectRatio;

  const references = [params.imageUrl, ...(params.imageUrls ?? [])].filter(
    (url): url is string => typeof url === 'string' && url.length > 0,
  );
  const unique = [...new Set(references)].slice(0, H3_MAX_REFERENCE_IMAGES);
  if (unique.length > 0) input.reference_image_urls = unique;

  input.prompt_expansion_mode =
    typeof params.promptExtend === 'string' &&
    H3_REFERENCE_PROMPT_EXPANSION_MODES.has(params.promptExtend)
      ? params.promptExtend
      : 'balanced';
  if (params.seed !== null && params.seed !== undefined) input.seed = params.seed;
  return input;
};

const buildFalH3VideoInput = (
  endpoint: string,
  params: CreateVideoPayload['params'],
): { endpoint: string; input: Record<string, unknown> } => {
  if (endpoint.endsWith('/reference-to-video')) {
    return { endpoint, input: buildFalH3ReferenceInput(params) };
  }

  const hasStartFrame = typeof params.imageUrl === 'string' && params.imageUrl.length > 0;
  const hasEndFrame = typeof params.endImageUrl === 'string' && params.endImageUrl.length > 0;

  // A bare `minimax/h3-max` id resolves to the matching task endpoint.
  const resolvedEndpoint = /\/(?:text|image)-to-video$/.test(endpoint)
    ? endpoint
    : `${endpoint}/${hasStartFrame ? 'image' : 'text'}-to-video`;
  const isImageToVideo = resolvedEndpoint.endsWith('/image-to-video');

  const input: Record<string, unknown> = { prompt: params.prompt };

  // Integer seconds, clamped to the fal schema range.
  const duration = clampH3Duration(params.duration);
  if (duration !== undefined) input.duration = duration;
  if (params.resolution) input.resolution = String(params.resolution).toUpperCase();
  // image-to-video has no aspect_ratio: the start frame decides it.
  if (!isImageToVideo && params.aspectRatio) input.aspect_ratio = params.aspectRatio;
  if (isImageToVideo) {
    if (hasStartFrame) input.image_url = params.imageUrl;
    // fal rejects an end frame without a start frame, so only forward the pair.
    if (hasStartFrame && hasEndFrame) input.end_image_url = params.endImageUrl;
  }
  const expansion =
    typeof params.promptExtend === 'string' && H3_PROMPT_EXPANSION_MODES.has(params.promptExtend)
      ? params.promptExtend
      : 'balanced';
  input.prompt_expansion_mode = expansion;
  if (params.seed !== null && params.seed !== undefined) input.seed = params.seed;

  return { endpoint: resolvedEndpoint, input };
};

// Talking-performer endpoints. Both return `{ video: { url } }` like every other
// fal video model, so the existing queue/poll path handles them; only the input
// shape differs (a driving audio track instead of a text prompt).
//   - `fal-ai/bytedance/omnihuman/v1.5`: still photo + audio -> talking video.
//     1080p caps audio at 30s, 720p at 60s (fal docs).
//   - `fal-ai/sync-lipsync/v3`: existing clip + audio -> re-lip-synced clip.
const isFalOmniHumanEndpoint = (endpoint: string) =>
  endpoint.startsWith('fal-ai/bytedance/omnihuman');
const isFalLipsyncEndpoint = (endpoint: string) => endpoint.startsWith('fal-ai/sync-lipsync');
export const isFalAvatarEndpoint = (endpoint: string) =>
  isFalOmniHumanEndpoint(endpoint) || isFalLipsyncEndpoint(endpoint);

const OMNIHUMAN_RESOLUTIONS = new Set(['720p', '1080p']);
const LIPSYNC_SYNC_MODES = new Set(['cut_off', 'loop', 'bounce', 'silence', 'remap']);

const nonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

// GPT Image 2 on fal has no `aspect_ratio` param; it takes `image_size`
// presets instead. These 5 ratios map 1:1 onto its non-`auto` presets
// (verified against the live fal API 2026-09-24). The model-bank schema
// (`gptImage2FalParamsSchema`) only offers these 5 ratios, so the lookup
// below is always a hit in normal use; an unmapped value is simply dropped
// rather than sent as an `aspect_ratio` fal would reject.
const GPT_IMAGE_2_ASPECT_RATIO_TO_IMAGE_SIZE: Record<string, string> = {
  '1:1': 'square_hd',
  '3:4': 'portrait_4_3',
  '4:3': 'landscape_4_3',
  '9:16': 'portrait_16_9',
  '16:9': 'landscape_16_9',
};

export const buildFalAvatarInput = (
  endpoint: string,
  params: Record<string, unknown>,
): Record<string, unknown> => {
  if (!nonEmptyString(params.audioUrl)) {
    throw new Error('audioUrl is required for talking-performer endpoints');
  }

  if (isFalLipsyncEndpoint(endpoint)) {
    if (!nonEmptyString(params.videoUrl)) {
      throw new Error('videoUrl is required for sync-lipsync');
    }
    const syncMode =
      typeof params.syncMode === 'string' && LIPSYNC_SYNC_MODES.has(params.syncMode)
        ? params.syncMode
        : 'cut_off';
    return { audio_url: params.audioUrl, sync_mode: syncMode, video_url: params.videoUrl };
  }

  if (!nonEmptyString(params.imageUrl)) {
    throw new Error('imageUrl is required for OmniHuman');
  }
  const input: Record<string, unknown> = {
    audio_url: params.audioUrl,
    image_url: params.imageUrl,
  };
  // OmniHuman's prompt is optional guidance; the app's required prompt field
  // doubles as the batch label, so only forward it when it carries content.
  if (nonEmptyString(params.prompt)) input.prompt = params.prompt;
  const resolution = typeof params.resolution === 'string' ? params.resolution.toLowerCase() : '';
  input.resolution = OMNIHUMAN_RESOLUTIONS.has(resolution) ? resolution : '1080p';
  if (params.turboMode === true) input.turbo_mode = true;
  return input;
};

// Video-to-video restyle endpoints: fix one existing clip instead of
// regenerating. Both return `{ video: { url } }` like every other fal video
// model, so the existing queue/poll path handles them; only the input shape
// differs (a source clip URL instead of a start frame).
//   - `decart/lucy-edit/pro`: in-place restyle, `video_url` + `prompt` only
//     (the live schema exposes a single `resolution` option, "720p").
//   - `fal-ai/kling-video/o3/pro/video-to-video/edit`: prompt-driven edit,
//     `video_url` + `prompt`, with an optional `keep_audio` toggle (defaults
//     to true on fal's side, so only forwarded when the caller turns it off).
const isFalLucyEditEndpoint = (endpoint: string) => endpoint.startsWith('decart/lucy-edit');
const isFalKlingEditEndpoint = (endpoint: string) =>
  endpoint.startsWith('fal-ai/kling-video/o3/pro/video-to-video/edit');
export const isFalVideoRestyleEndpoint = (endpoint: string) =>
  isFalLucyEditEndpoint(endpoint) || isFalKlingEditEndpoint(endpoint);

export const buildFalVideoRestyleInput = (
  endpoint: string,
  params: Record<string, unknown>,
): Record<string, unknown> => {
  if (!nonEmptyString(params.videoUrl)) {
    throw new Error('videoUrl is required for video restyle endpoints');
  }

  const input: Record<string, unknown> = {
    prompt: typeof params.prompt === 'string' ? params.prompt : '',
    video_url: params.videoUrl,
  };

  if (isFalKlingEditEndpoint(endpoint) && params.keepAudio === false) {
    input.keep_audio = false;
  }

  return input;
};

// ElevenLabs TTS endpoints understand SSML-like `<break time="Ns" />` markup
// for an N-second pause (the app's Ad Voice tool inserts these). MiniMax's
// speech-2.8-hd endpoint has no SSML support but documents its own `<#x#>`
// marker for the same purpose (x = 0.01-99.99 seconds, verified against fal's
// live model docs 2026-09-24) — translate rather than strip so MiniMax scripts
// keep the pause instead of losing it or reading the ElevenLabs tag aloud.
const ELEVENLABS_BREAK_TAG = /<break\s+time="(\d+(?:\.\d+)?)s"\s*\/>/g;
const MINIMAX_PAUSE_SECONDS_MIN = 0.01;
const MINIMAX_PAUSE_SECONDS_MAX = 99.99;

export const translateBreaksForMiniMax = (text: string): string =>
  text.replaceAll(ELEVENLABS_BREAK_TAG, (_match, seconds: string) => {
    const clamped = Math.min(
      MINIMAX_PAUSE_SECONDS_MAX,
      Math.max(MINIMAX_PAUSE_SECONDS_MIN, Number(seconds)),
    );
    // Up to two decimal places; trim a trailing ".00"/".x0" so whole and
    // one-decimal seconds ("1s", "1.5s") stay as clean as the input looked.
    const rounded = Math.round(clamped * 100) / 100;
    return `<#${rounded}#>`;
  });

// Audio endpoints (voiceover, music, sound effects). All synchronous via
// `fal.subscribe`, all return `{ audio: { url } }`; only the request shape
// differs per vendor. Verified against each endpoint's live OpenAPI schema.
const FAL_AUDIO_BUILDERS: [
  test: (endpoint: string) => boolean,
  build: (p: TextToSpeechPayload) => Record<string, unknown>,
][] = [
  [
    (e) => e.startsWith('fal-ai/elevenlabs/tts/'),
    ({ input, voice, params = {} }) => {
      const body: Record<string, unknown> = { text: input };
      if (voice) body.voice = voice;
      if (typeof params.speed === 'number') body.speed = params.speed;
      if (typeof params.stability === 'number') body.stability = params.stability;
      if (typeof params.similarityBoost === 'number')
        body.similarity_boost = params.similarityBoost;
      if (typeof params.style === 'number') body.style = params.style;
      if (typeof params.languageCode === 'string') body.language_code = params.languageCode;
      return body;
    },
  ],
  [
    (e) => e.startsWith('fal-ai/minimax/speech'),
    ({ input, voice, params = {} }) => {
      const voice_setting: Record<string, unknown> = {};
      if (voice) voice_setting.voice_id = voice;
      if (typeof params.speed === 'number') voice_setting.speed = params.speed;
      if (typeof params.emotion === 'string') voice_setting.emotion = params.emotion;
      const body: Record<string, unknown> = {
        output_format: 'url',
        prompt: translateBreaksForMiniMax(input),
      };
      if (Object.keys(voice_setting).length > 0) body.voice_setting = voice_setting;
      return body;
    },
  ],
  [
    (e) => e.startsWith('fal-ai/elevenlabs/music'),
    ({ input, params = {} }) => {
      const body: Record<string, unknown> = { prompt: input };
      if (typeof params.lengthMs === 'number') body.music_length_ms = Math.round(params.lengthMs);
      if (params.instrumental === true) body.force_instrumental = true;
      return body;
    },
  ],
  [
    (e) => e.startsWith('fal-ai/elevenlabs/sound-effects'),
    ({ input, params = {} }) => {
      const body: Record<string, unknown> = { text: input };
      if (typeof params.durationSeconds === 'number')
        body.duration_seconds = params.durationSeconds;
      if (typeof params.promptInfluence === 'number')
        body.prompt_influence = params.promptInfluence;
      if (params.loop === true) body.loop = true;
      return body;
    },
  ],
];

export const buildFalAudioInput = (
  endpoint: string,
  payload: TextToSpeechPayload,
): Record<string, unknown> => {
  const builder = FAL_AUDIO_BUILDERS.find(([test]) => test(endpoint));
  if (!builder) throw new Error(`Unsupported fal audio endpoint: ${endpoint}`);
  return builder[1](payload);
};

// inferenceId must round-trip through the async task queue as a single string,
// but fal's queue API needs both the endpoint and the request id to poll.
const FAL_INFERENCE_ID_SEPARATOR = '::';

// fal's webhook payload carries only the request id, not the endpoint, so the
// endpoint rides on the callback URL as a query param and is read back from
// `query` in `handleCreateVideoWebhook`.
const FAL_WEBHOOK_ENDPOINT_PARAM = 'endpoint';

const withFalWebhookEndpoint = (callbackUrl: string, endpoint: string) => {
  const url = new URL(callbackUrl);
  url.searchParams.set(FAL_WEBHOOK_ENDPOINT_PARAM, endpoint);
  return url.toString();
};

type FluxDevOutput = Awaited<ReturnType<typeof fal.subscribe<'fal-ai/flux/dev'>>>['data'];

export class LobeFalAI implements LobeRuntimeAI {
  private readonly modelIdMappingOptions: ModelIdMappingOptions;

  // OpenAI SDK v6 widened `apiKey` to `string | ApiKeySetter`; lobehub only uses the string form.
  constructor({
    apiKey,
    modelIdMapping,
  }: Omit<ClientOptions, 'apiKey'> & { apiKey?: string } & ModelIdMappingOptions = {}) {
    if (!apiKey) throw AgentRuntimeError.createError(AgentRuntimeErrorType.InvalidProviderAPIKey);

    fal.config({
      credentials: apiKey,
    });
    this.modelIdMappingOptions = { modelIdMapping };
    log('FalAI initialized with apiKey: %s', apiKey ? '*****' : 'Not set');
  }

  async createImage(payload: CreateImagePayload): Promise<CreateImageResponse> {
    const { model, params } = payload;
    const requestModel = resolveMappedModelId(model, this.modelIdMappingOptions);
    log('Creating image with model: %s and params: %O', requestModel, params);

    const paramsMap = new Map<RuntimeImageGenParamsValue, string>([
      ['steps', 'num_inference_steps'],
      ['cfg', 'guidance_scale'],
      ['imageUrl', 'image_url'],
      ['imageUrls', 'image_urls'],
      ['size', 'image_size'],
      // Was previously unmapped, so FLUX.1 Kontext [pro] and Imagen 4's
      // `aspectRatio` picker silently had no effect on the fal call (fal's
      // schema uses `aspect_ratio`, not the camelCase model-bank key).
      ['aspectRatio', 'aspect_ratio'],
      // Ideogram V4's rendering-speed tier (TURBO/BALANCED/QUALITY) is the only
      // fal model using the standard `quality` field today.
      ['quality', 'rendering_speed'],
    ]);

    const defaultInput: Record<string, unknown> = {
      enable_safety_checker: false,
      num_images: 1,
    };
    const userInput: Record<string, unknown> = Object.fromEntries(
      (Object.entries(params) as [keyof typeof params, any][])
        .filter(([, value]) => {
          const isEmptyValue =
            value === null || value === undefined || (Array.isArray(value) && value.length === 0);
          return !isEmptyValue;
        })
        .map(([key, value]) => [paramsMap.get(key) ?? key, value]),
    );

    // GPT Image 2 has no `aspect_ratio` param on fal; convert the ratio the
    // model-bank schema exposes into the `image_size` preset it actually
    // accepts (see GPT_IMAGE_2_ASPECT_RATIO_TO_IMAGE_SIZE above).
    if (requestModel === 'openai/gpt-image-2' && typeof userInput.aspect_ratio === 'string') {
      const imageSize = GPT_IMAGE_2_ASPECT_RATIO_TO_IMAGE_SIZE[userInput.aspect_ratio];
      if (imageSize) userInput.image_size = imageSize;
      delete userInput.aspect_ratio;
    }

    if ('width' in userInput && 'height' in userInput) {
      if (userInput.size) {
        throw new Error('width/height and size are not supported at the same time');
      } else {
        userInput.image_size = {
          height: userInput.height,
          width: userInput.width,
        };
        delete userInput.width;
        delete userInput.height;
      }
    }

    const modelsAcceleratedByDefault = new Set<string>(['flux/krea']);
    if (modelsAcceleratedByDefault.has(requestModel)) {
      defaultInput['acceleration'] = 'high';
    }

    let endpoint = resolveFalEndpoint(requestModel);
    const hasImageUrls = (params.imageUrls?.length ?? 0) > 0;
    if (
      ['fal-ai/bytedance/seedream/v', 'fal-ai/hunyuan-image/v'].some((m) => endpoint.startsWith(m))
    ) {
      endpoint += hasImageUrls ? '/edit' : '/text-to-image';
    } else if (
      ['fal-ai/nano-banana', 'fal-ai/nano-banana-2', 'openai/gpt-image-2'].includes(endpoint) &&
      hasImageUrls
    ) {
      endpoint += '/edit';
    }

    const finalInput = {
      ...defaultInput,
      ...userInput,
    };

    log('Calling fal.subscribe with endpoint: %s and input: %O', endpoint, finalInput);
    try {
      const { data } = await fal.subscribe(endpoint, {
        input: finalInput,
      });
      // Utility endpoints (e.g. birefnet, bria/increase-resolution) return a
      // singular `image`, not the `images[]` array every other fal image model uses.
      const image =
        (data as FluxDevOutput).images?.[0] ??
        (data as { image?: FluxDevOutput['images'][0] }).image!;

      return {
        imageUrl: image.url,
        ...pick(image, ['width', 'height']),
      };
    } catch (error) {
      // https://docs.fal.ai/model-apis/errors/
      if (error instanceof Error && 'status' in error && error.status === 401) {
        throw AgentRuntimeError.createError(AgentRuntimeErrorType.InvalidProviderAPIKey, {
          error,
        });
      }

      // 422 ValidationError with content_policy_violation — show a clean message
      if (error instanceof Error && 'status' in error && error.status === 422) {
        const body = 'body' in error ? (error as any).body : undefined;
        const hasContentPolicyViolation =
          Array.isArray(body?.detail) &&
          body.detail.some((d: any) => d.type === 'content_policy_violation');

        if (hasContentPolicyViolation) {
          throw AgentRuntimeError.createError(AgentRuntimeErrorType.ProviderBizError, {
            error,
            message:
              'The request content violates content policy. Please modify your prompt and try again.',
          });
        }
      }

      throw AgentRuntimeError.createError(AgentRuntimeErrorType.ProviderBizError, { error });
    }
  }

  async createVideo(payload: CreateVideoPayload): Promise<CreateVideoResponse> {
    const { model, params } = payload;
    const requestModel = resolveMappedModelId(model, this.modelIdMappingOptions);
    let endpoint = resolveFalEndpoint(requestModel);

    let input: Record<string, unknown>;
    if (isFalH3Endpoint(endpoint)) {
      ({ endpoint, input } = buildFalH3VideoInput(endpoint, params));
    } else if (isFalAvatarEndpoint(endpoint)) {
      input = buildFalAvatarInput(endpoint, params as Record<string, unknown>);
    } else if (isFalVideoRestyleEndpoint(endpoint)) {
      input = buildFalVideoRestyleInput(endpoint, params as Record<string, unknown>);
    } else if (isFalVeoEndpoint(endpoint)) {
      ({ endpoint, input } = buildFalVeoVideoInput(endpoint, params));
    } else {
      input = { prompt: params.prompt };
      if (params.aspectRatio) input.aspect_ratio = params.aspectRatio;
      // Veo-style fal video endpoints take duration as an enum string like "8s"
      if (params.duration) input.duration = `${params.duration}s`;
      if (params.resolution) input.resolution = params.resolution;
      if (params.seed !== null && params.seed !== undefined) input.seed = params.seed;
    }

    log('Submitting fal video task on endpoint: %s with input: %O', endpoint, input);
    try {
      // Prefer fal's webhook when the caller can receive one: video renders
      // (Veo especially) routinely outlive the serverless function whose
      // post-response hook would otherwise have to keep polling, and a task
      // whose poller died was never marked done. fal retries webhook delivery
      // for up to two hours, so completion no longer depends on our process
      // staying alive. Without a callback URL, fall back to polling.
      const webhookUrl = payload.callbackUrl
        ? withFalWebhookEndpoint(payload.callbackUrl, endpoint)
        : undefined;
      const { request_id } = await fal.queue.submit(endpoint, {
        input,
        ...(webhookUrl ? { webhookUrl } : {}),
      });

      const inferenceId = `${endpoint}${FAL_INFERENCE_ID_SEPARATOR}${request_id}`;
      return webhookUrl ? { inferenceId, useWebhook: true } : { inferenceId };
    } catch (error) {
      if (error instanceof Error && 'status' in error && error.status === 401) {
        throw AgentRuntimeError.createError(AgentRuntimeErrorType.InvalidProviderAPIKey, {
          error,
        });
      }

      throw AgentRuntimeError.createError(AgentRuntimeErrorType.ProviderBizError, { error });
    }
  }

  /**
   * Voiceover / music / sound effects. Returns the audio bytes so callers can
   * store them like any other TTS output; fal's own hosted URL is short-lived.
   */
  async textToSpeech(payload: TextToSpeechPayload): Promise<ArrayBuffer> {
    const requestModel = resolveMappedModelId(payload.model, this.modelIdMappingOptions);
    const endpoint = resolveFalEndpoint(requestModel);
    const input = buildFalAudioInput(endpoint, payload);
    log('Calling fal audio endpoint %s with input: %O', endpoint, input);

    let audioUrl: string | undefined;
    try {
      const { data } = await fal.subscribe(endpoint, { input });
      audioUrl = (data as { audio?: { url?: string } })?.audio?.url;
    } catch (error) {
      if (error instanceof Error && 'status' in error && error.status === 401) {
        throw AgentRuntimeError.createError(AgentRuntimeErrorType.InvalidProviderAPIKey, {
          error,
        });
      }
      throw AgentRuntimeError.createError(AgentRuntimeErrorType.ProviderBizError, { error });
    }

    if (!audioUrl) {
      throw AgentRuntimeError.createError(AgentRuntimeErrorType.ProviderBizError, {
        error: new Error('fal returned a completed audio task without an audio url'),
      });
    }

    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw AgentRuntimeError.createError(AgentRuntimeErrorType.ProviderBizError, {
        error: new Error(`Failed to download fal audio: ${response.status}`),
      });
    }
    return response.arrayBuffer();
  }

  /**
   * Parses fal's queue webhook (https://docs.fal.ai/model-apis/model-endpoints/webhooks):
   * `{ request_id, gateway_request_id, status: 'OK' | 'ERROR', payload, error?, payload_error? }`.
   * The generic handler has already matched the callback's per-task secret token
   * before acting on the result, which is what guards against forged callbacks.
   */
  async handleCreateVideoWebhook(
    payload: HandleCreateVideoWebhookPayload,
  ): Promise<HandleCreateVideoWebhookResult> {
    const body = (payload.body ?? {}) as {
      error?: string;
      payload?: { detail?: unknown; video?: { url?: string } } | null;
      payload_error?: string;
      request_id?: string;
      status?: string;
    };
    const endpoint = payload.query?.[FAL_WEBHOOK_ENDPOINT_PARAM];
    const requestId = body.request_id;

    if (!endpoint || !requestId) {
      return { status: 'pending' };
    }
    const inferenceId = `${endpoint}${FAL_INFERENCE_ID_SEPARATOR}${requestId}`;

    if (body.status === 'ERROR') {
      const detail = body.payload?.detail;
      const message =
        body.error ??
        body.payload_error ??
        (typeof detail === 'string' ? detail : JSON.stringify(detail ?? 'unknown error'));
      return { error: message, inferenceId, status: 'error' };
    }

    if (body.status === 'OK') {
      const videoUrl = body.payload?.video?.url;
      if (!videoUrl) {
        return {
          error: body.payload_error ?? 'fal webhook succeeded without a video url',
          inferenceId,
          status: 'error',
        };
      }
      return { inferenceId, status: 'success', videoUrl };
    }

    return { status: 'pending' };
  }

  async handlePollVideoStatus(inferenceId: string): Promise<PollVideoStatusResult> {
    const separatorIndex = inferenceId.lastIndexOf(FAL_INFERENCE_ID_SEPARATOR);
    if (separatorIndex === -1) {
      return { error: `Invalid fal inference id: ${inferenceId}`, status: 'failed' };
    }
    const endpoint = inferenceId.slice(0, separatorIndex);
    const requestId = inferenceId.slice(separatorIndex + FAL_INFERENCE_ID_SEPARATOR.length);

    try {
      const status = await fal.queue.status(endpoint, { logs: false, requestId });
      log('fal video task %s status: %s', requestId, status.status);

      if (status.status !== 'COMPLETED') return { status: 'pending' };

      const { data } = await fal.queue.result(endpoint, { requestId });
      const videoUrl = (data as { video?: { url?: string } })?.video?.url;
      if (!videoUrl) {
        return { error: 'fal returned a completed task without a video url', status: 'failed' };
      }

      return { status: 'success', videoUrl };
    } catch (error) {
      log('fal video task %s poll failed: %O', requestId, error);
      return { error: error instanceof Error ? error.message : String(error), status: 'failed' };
    }
  }
}
