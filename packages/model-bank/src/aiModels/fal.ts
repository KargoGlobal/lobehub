import type { ModelParamsSchema, VideoModelParamsSchema } from '../standard-parameters';
import type { AIImageModelCard, AITTSModelCard, AIVideoModelCard } from '../types/aiModel';

export const fluxSchnellParamsSchema: ModelParamsSchema = {
  height: { default: 1024, max: 1536, min: 512, step: 1 },
  prompt: { default: '' },
  seed: { default: null },
  steps: { default: 4, max: 12, min: 1, step: 1 },
  width: { default: 1024, max: 1536, min: 512, step: 1 },
};

export const fluxKreaParamsSchema: ModelParamsSchema = {
  cfg: { default: 7.5, max: 20, min: 0, step: 0.1 },
  height: { default: 1248, max: 2048, min: 512, step: 1 },
  prompt: { default: '' },
  seed: { default: null },
  steps: { default: 28, max: 50, min: 1, step: 1 },
  width: { default: 832, max: 2048, min: 512, step: 1 },
};

export const qwenImageParamsSchema: ModelParamsSchema = {
  cfg: { default: 2.5, max: 20, min: 0, step: 0.1 },
  // Tested: fal width/height max support up to 1536
  // Default values from https://chat.qwen.ai/ official website
  height: { default: 1328, max: 1536, min: 512, step: 1 },
  prompt: { default: '' },
  seed: { default: null },
  steps: { default: 30, max: 50, min: 2, step: 1 },
  width: { default: 1328, max: 1536, min: 512, step: 1 },
};

export const qwenEditParamsSchema: ModelParamsSchema = {
  cfg: { default: 4, max: 20, min: 0, step: 0.1 },
  height: { default: 1328, max: 1536, min: 512, step: 1 },
  imageUrl: { default: null },
  prompt: { default: '' },
  seed: { default: null },
  steps: { default: 30, max: 50, min: 2, step: 1 },
  width: { default: 1328, max: 1536, min: 512, step: 1 },
};

// GPT Image 2 on fal takes `image_size` presets, not a literal ratio string;
// these 5 ratios map 1:1 onto its non-`auto` presets (verified against the
// live fal API 2026-09-24: square_hd, landscape_4_3, landscape_16_9,
// portrait_4_3, portrait_16_9). The runtime converts the ratio to the preset
// name (packages/model-runtime/src/providers/fal/index.ts).
export const gptImage2FalParamsSchema: ModelParamsSchema = {
  aspectRatio: {
    default: '16:9',
    enum: ['1:1', '16:9', '9:16', '4:3', '3:4'],
  },
  imageUrls: { default: [], maxCount: 10 },
  prompt: {
    default: '',
  },
};

// Nano Banana 2 on fal accepts `aspect_ratio` directly with these literal
// ratio strings (verified against the live fal API 2026-09-24, both the
// text-to-image and /edit endpoints); no runtime conversion needed.
export const nanoBanana2FalParamsSchema: ModelParamsSchema = {
  aspectRatio: {
    default: '16:9',
    enum: [
      'auto',
      '1:1',
      '2:3',
      '3:2',
      '3:4',
      '4:3',
      '4:5',
      '5:4',
      '9:16',
      '16:9',
      '21:9',
      '1:4',
      '4:1',
      '1:8',
      '8:1',
    ],
  },
  imageUrls: { default: [], maxCount: 10 },
  prompt: {
    default: '',
  },
};

export const huanyuanImageParamsSchema: ModelParamsSchema = {
  cfg: { default: 7.5, max: 20, min: 1, step: 0.1 },
  prompt: { default: '' },
  seed: { default: null },
  size: {
    default: 'square_hd',
    enum: [
      'square_hd',
      'square',
      'portrait_4_3',
      'portrait_16_9',
      'landscape_4_3',
      'landscape_16_9',
    ],
  },
  steps: { default: 28, max: 50, min: 1, step: 1 },
};

const falImageModels: AIImageModelCard[] = [
  {
    description:
      'OpenAI’s GPT Image 2 model served via fal, with strong prompt adherence, text rendering, and conversational image editing.',
    displayName: 'GPT Image 2',
    enabled: true,
    id: 'openai/gpt-image-2',
    organization: 'OpenAI',
    parameters: gptImage2FalParamsSchema,
    pricing: {
      units: [{ name: 'imageGeneration', rate: 0.07, strategy: 'fixed', unit: 'image' }],
    },
    releasedAt: '2026-05-20',
    type: 'image',
  },
  {
    description:
      'Nano Banana 2 is the latest generation of Google’s fast multimodal image model, served via fal, with improved fidelity and editing through conversation.',
    displayName: 'Nano Banana 2',
    enabled: true,
    id: 'fal-ai/nano-banana-2',
    parameters: nanoBanana2FalParamsSchema,
    pricing: {
      units: [{ name: 'imageGeneration', rate: 0.06, strategy: 'fixed', unit: 'image' }],
    },
    releasedAt: '2026-06-15',
    type: 'image',
  },
  {
    description:
      'Nano Banana is Google’s newest, fastest, and most efficient native multimodal model, enabling image generation and editing through conversation.',
    displayName: 'Nano Banana',
    enabled: true,
    id: 'fal-ai/nano-banana',
    parameters: {
      imageUrls: { default: [], maxCount: 10 },
      prompt: {
        default: '',
      },
    },
    pricing: {
      units: [{ name: 'imageGeneration', rate: 0.039, strategy: 'fixed', unit: 'image' }],
    },
    releasedAt: '2025-08-26',
    type: 'image',
  },
  {
    description:
      'Seedream 4.0 is an image generation model from ByteDance Seed, supporting text and image inputs with highly controllable, high-quality image generation. It generates images from text prompts.',
    displayName: 'Seedream 4.0',
    enabled: true,
    id: 'fal-ai/bytedance/seedream/v4',
    parameters: {
      height: { default: 1024, max: 4096, min: 1024, step: 1 },
      imageUrls: { default: [], maxCount: 10, maxFileSize: 10 * 1024 * 1024 },
      prompt: {
        default: '',
      },
      seed: { default: null },
      width: { default: 1024, max: 4096, min: 1024, step: 1 },
    },
    pricing: {
      units: [{ name: 'imageGeneration', rate: 0.03, strategy: 'fixed', unit: 'image' }],
    },
    releasedAt: '2025-09-09',
    type: 'image',
  },
  {
    description: 'A powerful native multimodal image generation model.',
    displayName: 'HunyuanImage 3.0',
    enabled: true,
    id: 'fal-ai/hunyuan-image/v3',
    parameters: huanyuanImageParamsSchema,
    pricing: {
      units: [{ name: 'imageGeneration', rate: 0.1, strategy: 'fixed', unit: 'megapixel' }],
    },
    releasedAt: '2025-09-28',
    type: 'image',
  },
  {
    description: 'FLUX.1 model focused on image editing, supporting text and image inputs.',
    displayName: 'FLUX.1 Kontext [dev]',
    enabled: true,
    id: 'fal-ai/flux-kontext/dev',
    parameters: {
      imageUrl: { default: null },
      prompt: { default: '' },
      seed: { default: null },
      steps: { default: 28, max: 50, min: 10 },
    },
    pricing: {
      units: [{ name: 'imageGeneration', rate: 0.025, strategy: 'fixed', unit: 'megapixel' }],
    },
    releasedAt: '2025-06-28',
    type: 'image',
  },
  {
    description:
      'FLUX.1 Kontext [pro] accepts text and reference images as input, enabling targeted local edits and complex global scene transformations.',
    displayName: 'FLUX.1 Kontext [pro]',
    enabled: true,
    id: 'fal-ai/flux-pro/kontext',
    parameters: {
      aspectRatio: {
        default: '1:1',
        enum: ['21:9', '16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16', '9:21'],
      },
      imageUrl: { default: null },
      prompt: { default: '' },
      seed: { default: null },
    },
    pricing: {
      units: [{ name: 'imageGeneration', rate: 0.04, strategy: 'fixed', unit: 'image' }],
    },
    releasedAt: '2025-05-01',
    type: 'image',
  },
  {
    description:
      'FLUX.1 [schnell] is a 12B-parameter image generation model built for fast, high-quality output.',
    displayName: 'FLUX.1 Schnell',
    enabled: true,
    id: 'fal-ai/flux/schnell',
    parameters: fluxSchnellParamsSchema,
    pricing: {
      units: [{ name: 'imageGeneration', rate: 0.003, strategy: 'fixed', unit: 'megapixel' }],
    },
    releasedAt: '2024-08-01',
    type: 'image',
  },
  {
    description:
      'Flux Krea [dev] is an image generation model with an aesthetic bias toward more realistic, natural images.',
    displayName: 'FLUX.1 Krea [dev]',
    enabled: true,
    id: 'fal-ai/flux/krea',
    parameters: fluxKreaParamsSchema,
    pricing: {
      units: [{ name: 'imageGeneration', rate: 0.025, strategy: 'fixed', unit: 'megapixel' }],
    },
    releasedAt: '2025-07-31',
    type: 'image',
  },
  {
    description: 'High-quality image generation model from Google.',
    displayName: 'Imagen 4',
    enabled: true,
    id: 'fal-ai/imagen4/preview',
    organization: 'Deepmind',
    parameters: {
      aspectRatio: {
        default: '1:1',
        enum: ['1:1', '16:9', '9:16', '3:4', '4:3'],
      },
      prompt: { default: '' },
      seed: { default: null },
    },
    pricing: {
      units: [{ name: 'imageGeneration', rate: 0.05, strategy: 'fixed', unit: 'image' }],
    },
    releasedAt: '2025-05-21',
    type: 'image',
  },
  {
    description:
      'A professional image editing model from the Qwen team that supports semantic and appearance edits, precisely edits Chinese and English text, and enables high-quality edits such as style transfer and object rotation.',
    displayName: 'Qwen Edit',
    enabled: true,
    id: 'fal-ai/qwen-image-edit',
    parameters: qwenEditParamsSchema,
    pricing: {
      units: [{ name: 'imageGeneration', rate: 0.03, strategy: 'fixed', unit: 'megapixel' }],
    },
    releasedAt: '2025-08-19',
    type: 'image',
  },
  {
    description:
      'A powerful image generation model from the Qwen team with impressive Chinese text rendering and diverse visual styles.',
    displayName: 'Qwen Image',
    enabled: true,
    id: 'fal-ai/qwen-image',
    parameters: qwenImageParamsSchema,
    pricing: {
      units: [{ name: 'imageGeneration', rate: 0.02, strategy: 'fixed', unit: 'megapixel' }],
    },
    releasedAt: '2025-08-04',
    type: 'image',
  },
  {
    description:
      'BiRefNet V2 removes the background from an image, returning a transparent PNG. Used for one-click background removal on existing or uploaded images.',
    displayName: 'Remove Background',
    enabled: false,
    id: 'fal-ai/birefnet/v2',
    parameters: {
      imageUrl: { default: null },
      prompt: { default: '' },
    },
    pricing: {
      units: [{ name: 'imageGeneration', rate: 0, strategy: 'fixed', unit: 'image' }],
    },
    releasedAt: '2026-09-09',
    type: 'image',
  },
  {
    description:
      'Bria Increase Resolution upscales an image 2x or 4x (up to 8192x8192) while preserving its original content. Used for one-click upscaling on existing or uploaded images.',
    displayName: 'Upscale',
    enabled: false,
    id: 'bria/increase-resolution',
    organization: 'Bria',
    parameters: {
      imageUrl: { default: null },
      prompt: { default: '' },
    },
    pricing: {
      units: [{ name: 'imageGeneration', rate: 0.04, strategy: 'fixed', unit: 'image' }],
    },
    releasedAt: '2026-09-09',
    type: 'image',
  },
  {
    description:
      'fal Image Editing Reframe changes an image to a new aspect ratio while keeping the subject composition intact. Used for one-click resizing to ad placement ratios on existing or uploaded images.',
    displayName: 'Auto-Resize',
    enabled: false,
    id: 'fal-ai/image-editing/reframe',
    parameters: {
      aspectRatio: {
        default: '1:1',
        enum: ['21:9', '16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16', '9:21'],
      },
      imageUrl: { default: null },
      prompt: { default: '' },
    },
    pricing: {
      units: [{ name: 'imageGeneration', rate: 0.04, strategy: 'fixed', unit: 'image' }],
    },
    releasedAt: '2026-09-12',
    type: 'image',
  },
  {
    description:
      'Bria Product Shot places a product photo into a new, described scene, generating a lifestyle-style shot. Used for one-click product placement on existing or uploaded product images.',
    displayName: 'Product Scene',
    enabled: false,
    id: 'fal-ai/bria/product-shot',
    organization: 'Bria',
    parameters: {
      imageUrl: { default: null },
      prompt: { default: '' },
    },
    pricing: {
      units: [{ name: 'imageGeneration', rate: 0.04, strategy: 'fixed', unit: 'image' }],
    },
    releasedAt: '2026-09-12',
    type: 'image',
  },
  {
    description:
      'IC-Light V2 relights an existing image to match a described light source and direction, without changing the subject. Used for one-click relighting on existing or uploaded images.',
    displayName: 'Relight',
    enabled: false,
    id: 'fal-ai/iclight-v2',
    parameters: {
      imageUrl: { default: null },
      prompt: { default: '' },
    },
    pricing: {
      units: [{ name: 'imageGeneration', rate: 0.1, strategy: 'fixed', unit: 'megapixel' }],
    },
    releasedAt: '2026-09-12',
    type: 'image',
  },
  {
    description:
      "Bria Eraser removes whatever is under a painted mask and reconstructs the background. Used by the mask editor's Erase mode on existing or uploaded images.",
    displayName: 'Erase',
    enabled: false,
    id: 'fal-ai/bria/eraser',
    organization: 'Bria',
    parameters: {
      imageUrl: { default: null },
      prompt: { default: '' },
    },
    pricing: {
      units: [{ name: 'imageGeneration', rate: 0.04, strategy: 'fixed', unit: 'image' }],
    },
    releasedAt: '2026-09-13',
    type: 'image',
  },
  {
    description:
      "FLUX.1 [pro] Fill regenerates the painted mask region from a text prompt (inpainting). Used by the mask editor's Replace mode on existing or uploaded images.",
    displayName: 'Replace',
    enabled: false,
    id: 'fal-ai/flux-pro/v1/fill',
    parameters: {
      imageUrl: { default: null },
      prompt: { default: '' },
    },
    pricing: {
      units: [{ name: 'imageGeneration', rate: 0.05, strategy: 'fixed', unit: 'megapixel' }],
    },
    releasedAt: '2026-09-13',
    type: 'image',
  },
  {
    description:
      "FASHN Try-On v1.6 dresses a photographed person in a garment photo, preserving the garment's pattern and details. Used by the Try-on tool on existing or uploaded garment images.",
    displayName: 'Try-on',
    enabled: false,
    id: 'fal-ai/fashn/tryon/v1.6',
    organization: 'FASHN',
    parameters: {
      imageUrl: { default: null },
      prompt: { default: '' },
    },
    pricing: {
      units: [{ name: 'imageGeneration', rate: 0.075, strategy: 'fixed', unit: 'image' }],
    },
    releasedAt: '2026-09-13',
    type: 'image',
  },
  // Typography tool endpoints: both are text-to-image (no `imageUrl` input), since that's
  // what the live schemas actually support — Ideogram and Recraft's text accuracy comes from
  // generating a fresh image around the copy, not editing one. The Typography tool still runs
  // them through `createEditedImage`, so the source image's url rides along as an ignored
  // `imageUrl` field (the fal endpoints don't define that field and drop it), the same pattern
  // the Try-on card above relies on. `enabled:false`: invoked directly by the Typography tool,
  // never from the model picker. Pricing verified on the fal model pages (2026-09-12).
  {
    description:
      'Ideogram V4 via fal: renders headlines, CTAs and price callouts as accurate, legible ' +
      'text inside a freshly generated image. $0.0075/megapixel TURBO, $0.015/megapixel ' +
      'BALANCED (default), $0.025/megapixel QUALITY.',
    displayName: 'Ideogram V4',
    enabled: false,
    id: 'ideogram/v4',
    organization: 'Ideogram',
    parameters: {
      prompt: { default: '' },
    },
    pricing: {
      units: [{ name: 'imageGeneration', rate: 0.015, strategy: 'fixed', unit: 'megapixel' }],
    },
    releasedAt: '2026-09-12',
    type: 'image',
  },
  {
    description:
      'Recraft V4 Pro Vector via fal: generates clean vector-style posters, logos and ad ' +
      "graphics with sharp, legible on-image text — Recraft's signature typography strength. " +
      '$0.30 per image.',
    displayName: 'Recraft Vector',
    enabled: false,
    id: 'fal-ai/recraft/v4/pro/text-to-vector',
    organization: 'Recraft',
    parameters: {
      prompt: { default: '' },
    },
    pricing: {
      units: [{ name: 'imageGeneration', rate: 0.3, strategy: 'fixed', unit: 'image' }],
    },
    releasedAt: '2026-09-12',
    type: 'image',
  },
];

const falVideoParamsSchema = {
  aspectRatio: {
    default: '16:9',
    enum: ['16:9', '9:16'],
  },
  duration: { default: 8, enum: [4, 6, 8] },
  prompt: { default: '' },
  resolution: {
    default: '720p',
    enum: ['720p', '1080p', '4k'],
  },
  seed: { default: null },
};

const falVideoModels: AIVideoModelCard[] = [
  {
    description:
      'Google’s Veo 3.1 text-to-video model served via fal: cinematic quality with native audio, ideal for ad-length product and brand clips.',
    displayName: 'Veo 3.1',
    enabled: true,
    id: 'fal-ai/veo3.1',
    organization: 'Deepmind',
    parameters: falVideoParamsSchema,
    pricing: {
      units: [{ name: 'videoGeneration', rate: 0.4, strategy: 'fixed', unit: 'second' }],
    },
    releasedAt: '2026-01-13',
    type: 'video',
  },
  {
    description:
      'Faster, lower-cost variant of Veo 3.1 served via fal — great for rapid ad concepting and iteration.',
    displayName: 'Veo 3.1 Fast',
    enabled: true,
    id: 'fal-ai/veo3.1/fast',
    organization: 'Deepmind',
    parameters: falVideoParamsSchema,
    pricing: {
      units: [{ name: 'videoGeneration', rate: 0.15, strategy: 'fixed', unit: 'second' }],
    },
    releasedAt: '2026-01-13',
    type: 'video',
  },
];

// MiniMax H3 Max via fal. One card covers both fal endpoints
// (`minimax/h3-max/text-to-video` and `minimax/h3-max/image-to-video`): the
// runtime picks the endpoint from whether a start frame is attached. Camera
// control is prompt-driven (filmmaking language + timestamped shot blocks), so
// the Camera Director in the video workspace targets this model.
const h3MaxParamsSchema: VideoModelParamsSchema = {
  // Only honoured by text-to-video; image-to-video follows the start frame.
  aspectRatio: {
    default: '16:9',
    enum: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
  },
  duration: { default: 8, max: 15, min: 5, step: 1 },
  endImageUrl: { default: null, requiresImageUrl: true },
  imageUrl: { default: null },
  prompt: { default: '' },
  // fal `prompt_expansion_mode`: `balanced` (~1s rewrite) or `quality` (~30s).
  promptExtend: { default: 'balanced', enum: ['balanced', 'quality'] },
  resolution: {
    default: '1080P',
    enum: ['480P', '768P', '1080P'],
  },
  seed: { default: null },
};

// MiniMax H3 reference-to-video via fal: up to 9 subject/style reference images,
// addressed in the prompt as "Image 1", "Image 2"... Used by Auto-animate for
// on-model / lifestyle concepts where the product must match a photo without
// being the literal first frame.
const h3ReferenceParamsSchema: VideoModelParamsSchema = {
  aspectRatio: {
    default: 'adaptive',
    enum: ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
  },
  duration: { default: 8, max: 15, min: 5, step: 1 },
  imageUrls: { default: [], maxCount: 9 },
  prompt: { default: '' },
  promptExtend: { default: 'balanced', enum: ['fast', 'balanced', 'quality'] },
  // 480P/768P are native; 2K/4K upscale a 768P base.
  resolution: {
    default: '2K',
    enum: ['480P', '768P', '2K', '4K'],
  },
  seed: { default: null },
};

const falH3VideoModels: AIVideoModelCard[] = [
  {
    description:
      'MiniMax H3 reference-to-video served via fal: up to 9 reference images the clip must match — for on-model, lifestyle and in-hand product shots that stay faithful to the real item.',
    displayName: 'MiniMax H3 Reference',
    enabled: true,
    id: 'minimax/h3/reference-to-video',
    organization: 'MiniMax',
    parameters: h3ReferenceParamsSchema,
    pricing: {
      // fal list price at the 2K default; 768P is 0.06/s, 4K 0.16/s.
      units: [{ name: 'videoGeneration', rate: 0.13, strategy: 'fixed', unit: 'second' }],
    },
    releasedAt: '2026-09-02',
    type: 'video',
  },
  {
    description:
      'MiniMax H3 Max served via fal: strong prompt adherence and temporal stability with native 1080p, 5–15s clips, start/end-frame control and prompt-driven camera moves — built for product spins and 3D background loops.',
    displayName: 'MiniMax H3 Max',
    enabled: true,
    id: 'minimax/h3-max',
    organization: 'MiniMax',
    parameters: h3MaxParamsSchema,
    pricing: {
      // fal list price at the 1080P default; 768P is 0.08/s and 480P 0.05/s.
      units: [{ name: 'videoGeneration', rate: 0.16, strategy: 'fixed', unit: 'second' }],
    },
    releasedAt: '2026-09-02',
    type: 'video',
  },
];

// Talking-performer video endpoints, driven by an audio track rather than a
// text prompt. Both are `enabled: false` utilities invoked by the Ad Voice tool
// (never from the model picker), and the tool itself sits behind the
// `synthetic_performer` feature flag until a disclosure policy is in place.
// Pricing verified on the fal model pages (2026-09-12).
const falAvatarVideoModels: AIVideoModelCard[] = [
  {
    description:
      'ByteDance OmniHuman 1.5 via fal: one still photo plus a voiceover becomes a talking ' +
      'video with matched lip-sync, gesture and expression. 1080p accepts up to 30s of audio, ' +
      '720p up to 60s. Output contains a synthetic performer — disclosure applies.',
    displayName: 'Talking photo',
    enabled: false,
    id: 'fal-ai/bytedance/omnihuman/v1.5',
    organization: 'ByteDance',
    parameters: {
      imageUrl: { default: null },
      prompt: { default: '' },
      resolution: { default: '1080p', enum: ['720p', '1080p'] },
    },
    pricing: {
      units: [{ name: 'videoGeneration', rate: 0.16, strategy: 'fixed', unit: 'second' }],
    },
    releasedAt: '2026-09-12',
    type: 'video',
  },
  {
    description:
      'sync. lipsync v3 via fal: re-syncs the mouth of a person in an existing clip to a new ' +
      'voiceover, so one filmed take can carry any script or language. Output contains a ' +
      'synthetic performer — disclosure applies.',
    displayName: 'Dub a clip',
    enabled: false,
    id: 'fal-ai/sync-lipsync/v3',
    organization: 'sync.',
    parameters: { prompt: { default: '' } },
    pricing: {
      // $8 per minute of output video.
      units: [{ name: 'videoGeneration', rate: 8 / 60, strategy: 'fixed', unit: 'second' }],
    },
    releasedAt: '2026-09-12',
    type: 'video',
  },
];

// Video-to-video restyle endpoints: fix one generated clip (wardrobe, props,
// look) instead of regenerating from scratch. Both are `enabled: false`
// utilities invoked by the Video Restyle tool (never from the model picker).
// `videoUrl` rides as an extra runtime param alongside `prompt`, same as the
// talking-performer cards above. Endpoint ids and pricing verified against
// fal's live OpenAPI schemas and model pages (2026-09-12).
const falVideoRestyleModels: AIVideoModelCard[] = [
  {
    description:
      'Lucy Edit [Pro] via fal: restyle an existing clip in place — swap an outfit, object, ' +
      'face or the whole look — while keeping the rest of the shot, motion and timing intact. ' +
      "720p output; the schema exposes only that tier today despite fal's pricing page also " +
      'listing a 480p rate.',
    displayName: 'Lucy Edit [Pro]',
    enabled: false,
    id: 'decart/lucy-edit/pro',
    organization: 'Decart',
    parameters: { prompt: { default: '' } },
    pricing: {
      units: [{ name: 'videoGeneration', rate: 0.15, strategy: 'fixed', unit: 'second' }],
    },
    releasedAt: '2026-09-12',
    type: 'video',
  },
  {
    description:
      'Kling O3 Edit [Pro] via fal: edit an existing clip with a text prompt (reference it as ' +
      '@Video1) — restyle the look, swap wardrobe or props, while optionally keeping the ' +
      'original audio. Source clip must be 3-15s, 720-3840px, .mp4/.mov, under 200MB.',
    displayName: 'Kling O3 Edit [Pro]',
    enabled: false,
    id: 'fal-ai/kling-video/o3/pro/video-to-video/edit',
    organization: 'Kuaishou',
    parameters: { prompt: { default: '' } },
    pricing: {
      units: [{ name: 'videoGeneration', rate: 0.168, strategy: 'fixed', unit: 'second' }],
    },
    releasedAt: '2026-09-12',
    type: 'video',
  },
];

// Audio endpoints for the Ad Voice tool (voiceover, music bed, sound effect).
// Synchronous on fal; output is stored as a file, not a generation. `tts` is
// the closest existing card type for all three (no `sfx`/music card type with
// per-second pricing exists), so the pricing notes carry the real unit.
export const falAudioModels: AITTSModelCard[] = [
  {
    description:
      'ElevenLabs Turbo v2.5 via fal: fast, natural English-first voiceover with the stock ' +
      'ElevenLabs voice library. $0.05 per 1,000 characters.',
    displayName: 'ElevenLabs Turbo v2.5',
    enabled: false,
    id: 'fal-ai/elevenlabs/tts/turbo-v2.5',
    organization: 'ElevenLabs',
    pricing: {
      units: [{ name: 'textInput', rate: 50, strategy: 'fixed', unit: 'millionCharacters' }],
    },
    releasedAt: '2026-09-12',
    type: 'tts',
  },
  {
    description:
      'MiniMax Speech 2.8 HD via fal: expressive multilingual voiceover with emotion control ' +
      'and 17 stock voices. $0.10 per 1,000 characters.',
    displayName: 'MiniMax Speech 2.8 HD',
    enabled: false,
    id: 'fal-ai/minimax/speech-2.8-hd',
    organization: 'MiniMax',
    pricing: {
      units: [{ name: 'textInput', rate: 100, strategy: 'fixed', unit: 'millionCharacters' }],
    },
    releasedAt: '2026-09-12',
    type: 'tts',
  },
  {
    description:
      'ElevenLabs Music via fal: a music bed from a text brief, 3s–10min, optional ' +
      'instrumental-only. $0.60 per output minute, rounded up.',
    displayName: 'ElevenLabs Music',
    enabled: false,
    id: 'fal-ai/elevenlabs/music',
    organization: 'ElevenLabs',
    pricing: {
      units: [{ name: 'audioOutput', rate: 0.01, strategy: 'fixed', unit: 'second' }],
    },
    releasedAt: '2026-09-12',
    type: 'tts',
  },
  {
    description:
      'ElevenLabs Sound Effects v2 via fal: a single sound effect (0.5–22s) from a short ' +
      'description, optionally seamless-looping. $0.002 per second.',
    displayName: 'ElevenLabs Sound Effects',
    enabled: false,
    id: 'fal-ai/elevenlabs/sound-effects/v2',
    organization: 'ElevenLabs',
    pricing: {
      units: [{ name: 'audioOutput', rate: 0.002, strategy: 'fixed', unit: 'second' }],
    },
    releasedAt: '2026-09-12',
    type: 'tts',
  },
];

export const allModels = [
  ...falImageModels,
  ...falVideoModels,
  ...falH3VideoModels,
  ...falAvatarVideoModels,
  ...falVideoRestyleModels,
  ...falAudioModels,
];

export default allModels;
