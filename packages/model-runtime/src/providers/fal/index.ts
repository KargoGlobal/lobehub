import { fal } from '@fal-ai/client';
import debug from 'debug';
import { pick } from 'es-toolkit/compat';
import type { RuntimeImageGenParamsValue } from 'model-bank';
import type { ClientOptions } from 'openai';

import type { LobeRuntimeAI } from '../../core/BaseAI';
import { AgentRuntimeErrorType } from '../../types/error';
import type { CreateImagePayload, CreateImageResponse } from '../../types/image';
import type {
  CreateVideoPayload,
  CreateVideoResponse,
  PollVideoStatusResult,
} from '../../types/video';
import { AgentRuntimeError } from '../../utils/createError';
import type { ModelIdMappingOptions } from '../../utils/modelIdMapping';
import { resolveMappedModelId } from '../../utils/modelIdMapping';

// Create debug logger
const log = debug('lobe-image:fal');

// fal hosts models under vendor namespaces (e.g. `openai/gpt-image-2`); only
// bare model ids get the default `fal-ai/` prefix.
const FAL_ENDPOINT_NAMESPACES = ['fal-ai/', 'openai/'];
const resolveFalEndpoint = (model: string) =>
  FAL_ENDPOINT_NAMESPACES.some((ns) => model.startsWith(ns)) ? model : `fal-ai/${model}`;

// inferenceId must round-trip through the async task queue as a single string,
// but fal's queue API needs both the endpoint and the request id to poll.
const FAL_INFERENCE_ID_SEPARATOR = '::';

type FluxDevOutput = Awaited<ReturnType<typeof fal.subscribe<'fal-ai/flux/dev'>>>['data'];

// Background-removal endpoints answer with a single `image`, not `images[]`.
// Reading `images[0]` off one of these throws before any error handling runs.
const BACKGROUND_REMOVAL_ENDPOINTS = new Set<string>(['fal-ai/birefnet/v2']);

interface BackgroundRemovalOutput {
  image?: { height?: number; url: string; width?: number };
}

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

    // Background removal is a different shape of call entirely: it takes an
    // image and no prompt, rejects the generation-only defaults below, and
    // answers with a single `image` rather than an `images` array.
    const isBackgroundRemoval = BACKGROUND_REMOVAL_ENDPOINTS.has(endpoint);

    const finalInput = isBackgroundRemoval
      ? {
          image_url: params.imageUrl ?? params.imageUrls?.[0],
          // A real alpha channel is the entire point, so the format is not
          // left to the caller — webp/gif would defeat the purpose here.
          output_format: 'png',
          refine_foreground: true,
          ...(params.quality ? { model: params.quality } : {}),
          ...(params.resolution ? { operating_resolution: params.resolution } : {}),
        }
      : {
          ...defaultInput,
          ...userInput,
        };

    log('Calling fal.subscribe with endpoint: %s and input: %O', endpoint, finalInput);
    try {
      const { data } = await fal.subscribe(endpoint, {
        input: finalInput,
      });
      const image = isBackgroundRemoval
        ? (data as BackgroundRemovalOutput).image
        : (data as FluxDevOutput).images[0];

      if (!image?.url) throw new Error('fal returned no image');

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
    const endpoint = resolveFalEndpoint(requestModel);

    const input: Record<string, unknown> = { prompt: params.prompt };
    if (params.aspectRatio) input.aspect_ratio = params.aspectRatio;
    // fal video endpoints take duration as an enum string like "8s"
    if (params.duration) input.duration = `${params.duration}s`;
    if (params.resolution) input.resolution = params.resolution;
    if (params.seed !== null && params.seed !== undefined) input.seed = params.seed;

    log('Submitting fal video task on endpoint: %s with input: %O', endpoint, input);
    try {
      const { request_id } = await fal.queue.submit(endpoint, { input });

      return { inferenceId: `${endpoint}${FAL_INFERENCE_ID_SEPARATOR}${request_id}` };
    } catch (error) {
      if (error instanceof Error && 'status' in error && error.status === 401) {
        throw AgentRuntimeError.createError(AgentRuntimeErrorType.InvalidProviderAPIKey, {
          error,
        });
      }

      throw AgentRuntimeError.createError(AgentRuntimeErrorType.ProviderBizError, { error });
    }
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
