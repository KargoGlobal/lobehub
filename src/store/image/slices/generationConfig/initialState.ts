import type { ModelParamsSchema, RuntimeImageGenParams } from 'model-bank';
import { extractDefaultValues, ModelProvider } from 'model-bank';
import { nanoBanana2Parameters } from 'model-bank/imageParameters';

import { DEFAULT_IMAGE_CONFIG } from '@/const/settings';

// Creative Studio runs fal-only and prefers GPT Image 2 for the first-run
// default. A user's last-selected model still wins once they've picked one.
export const DEFAULT_AI_IMAGE_PROVIDER = ModelProvider.Fal;
export const DEFAULT_AI_IMAGE_MODEL = 'openai/gpt-image-2';

export interface GenerationConfigState {
  parameters: RuntimeImageGenParams;
  parametersSchema: ModelParamsSchema;

  provider: string;
  model: string;
  imageNum: number;

  isAspectRatioLocked: boolean;
  activeAspectRatio: string | null; // string - virtual ratio; null - native ratio

  /**
   * Object-URL previews for reference images currently being uploaded. Shared
   * across the inline reference cards and the page-level drag-upload zone so
   * both surfaces show the same in-flight loading placeholders.
   */
  uploadingImagePreviews: string[];

  /**
   * True while the composer's reference images were attached by the Refine
   * action on a generated result (as opposed to manual uploads). Refine-attached
   * references are cleared after the next successful generation; manual uploads
   * persist. Any manual reference edit resets this to false.
   */
  isRefiningFromResult: boolean;

  /**
   * Marks whether the configuration has been initialized (including restoration from memory)
   */
  isInit: boolean;
}

export const DEFAULT_IMAGE_GENERATION_PARAMETERS: RuntimeImageGenParams =
  extractDefaultValues(nanoBanana2Parameters);

export const initialGenerationConfigState: GenerationConfigState = {
  model: DEFAULT_AI_IMAGE_MODEL,
  provider: DEFAULT_AI_IMAGE_PROVIDER,
  imageNum: DEFAULT_IMAGE_CONFIG.defaultImageNum,
  parameters: DEFAULT_IMAGE_GENERATION_PARAMETERS,
  parametersSchema: nanoBanana2Parameters,
  isAspectRatioLocked: false,
  activeAspectRatio: null,
  uploadingImagePreviews: [],
  isRefiningFromResult: false,
  isInit: false,
};
