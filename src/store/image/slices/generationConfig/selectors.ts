import { type RuntimeImageGenParamsKeys } from 'model-bank';

import { type GenerationConfigState } from './initialState';

export const model = (s: GenerationConfigState) => s.model;
export const provider = (s: GenerationConfigState) => s.provider;
export const imageNum = (s: GenerationConfigState) => s.imageNum;
const uploadingImagePreviews = (s: GenerationConfigState) => s.uploadingImagePreviews;

const parameters = (s: GenerationConfigState) => s.parameters;
const parametersSchema = (s: GenerationConfigState) => s.parametersSchema;
const isSupportedParam = (paramName: RuntimeImageGenParamsKeys) => {
  return (s: GenerationConfigState) => {
    const _parametersSchema = parametersSchema(s);
    return Boolean(paramName in _parametersSchema);
  };
};
const isRefiningFromResult = (s: GenerationConfigState) => s.isRefiningFromResult;

// Params the Configuration popover never renders anything for: the prompt
// input and reference-image uploads live in the composer itself, not the
// popover. Any other schema key corresponds to a control the popover can
// show (aspectRatio/width/height, size, quality, resolution, steps, cfg,
// seed, watermark, promptExtend, webSearch, ...), so this stays generic
// instead of duplicating each individual `isSupportedParam` check.
const NON_POPOVER_PARAMS = new Set<RuntimeImageGenParamsKeys>(['prompt', 'imageUrl', 'imageUrls']);

/**
 * True when the current model exposes at least one param the Configuration
 * popover would render a control for. Used to hide the Configuration button
 * entirely rather than opening an empty popover.
 */
const hasConfigurableParams = (s: GenerationConfigState) => {
  const schema = parametersSchema(s) ?? {};
  return Object.keys(schema).some(
    (key) => !NON_POPOVER_PARAMS.has(key as RuntimeImageGenParamsKeys),
  );
};

export const imageGenerationConfigSelectors = {
  model,
  provider,
  imageNum,
  isSupportedParam,
  hasConfigurableParams,
  isRefiningFromResult,
  parameters,
  parametersSchema,
  uploadingImagePreviews,
};
