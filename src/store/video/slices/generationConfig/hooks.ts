import { type RuntimeVideoGenParams, type RuntimeVideoGenParamsKeys } from 'model-bank';
import { useCallback, useMemo } from 'react';

import { aiProviderSelectors, useAiInfraStore } from '@/store/aiInfra';

import { useVideoStore } from '../../store';
import { videoGenerationConfigSelectors } from './selectors';

export function useVideoGenerationConfigParam<
  N extends RuntimeVideoGenParamsKeys,
  V extends RuntimeVideoGenParams[N],
>(paramName: N) {
  const parameters = useVideoStore(videoGenerationConfigSelectors.parameters);
  const parametersSchema = useVideoStore(videoGenerationConfigSelectors.parametersSchema);

  const paramValue = parameters?.[paramName] as V;
  const setParamsValue = useVideoStore((s) => s.setParamOnInput<N>);
  const setValue = useCallback(
    (value: V) => {
      setParamsValue(paramName, value);
    },
    [paramName, setParamsValue],
  );

  const paramConfig = parametersSchema?.[paramName];
  const paramConstraints = useMemo(() => {
    if (!paramConfig || typeof paramConfig !== 'object') return {};

    const maxFileSize = 'maxFileSize' in paramConfig ? paramConfig.maxFileSize : undefined;
    const aspectRatioConstraint =
      'aspectRatio' in paramConfig
        ? (paramConfig.aspectRatio as { max?: number; min?: number })
        : undefined;
    const widthConstraint =
      'width' in paramConfig ? (paramConfig.width as { max?: number; min?: number }) : undefined;
    const heightConstraint =
      'height' in paramConfig ? (paramConfig.height as { max?: number; min?: number }) : undefined;
    const imageConstraints =
      aspectRatioConstraint || widthConstraint || heightConstraint
        ? { aspectRatio: aspectRatioConstraint, height: heightConstraint, width: widthConstraint }
        : undefined;
    const enumValues = 'enum' in paramConfig ? (paramConfig.enum as string[]) : undefined;
    const min = 'min' in paramConfig ? (paramConfig.min as number) : undefined;
    const max = 'max' in paramConfig ? (paramConfig.max as number) : undefined;
    const maxCount = 'maxCount' in paramConfig ? (paramConfig.maxCount as number) : undefined;
    const step = 'step' in paramConfig ? (paramConfig.step as number) : undefined;

    return { enumValues, imageConstraints, max, maxCount, maxFileSize, min, step };
  }, [paramConfig]);

  return {
    setValue,
    value: paramValue as V,
    ...paramConstraints,
  };
}

/**
 * The active video model's human-readable name, looked up from the enabled
 * model list (falls back to the raw id while that list is still loading or
 * the model has since been removed).
 */
export function useVideoModelDisplayName(): string {
  const modelId = useVideoStore(videoGenerationConfigSelectors.model);
  const providerId = useVideoStore(videoGenerationConfigSelectors.provider);
  const enabledVideoModelList = useAiInfraStore(aiProviderSelectors.enabledVideoModelList);

  return useMemo(() => {
    const providerGroup = enabledVideoModelList.find((p) => p.id === providerId);
    const model = providerGroup?.children.find((m) => m.id === modelId) as
      { displayName?: string } | undefined;
    return model?.displayName ?? modelId;
  }, [enabledVideoModelList, providerId, modelId]);
}
