import { toast } from '@lobehub/ui/base-ui';
import { t } from 'i18next';
import {
  type AIVideoModelCard,
  extractVideoDefaultValues,
  type RuntimeVideoGenParams,
  type RuntimeVideoGenParamsKeys,
  type RuntimeVideoGenParamsValue,
  type VideoModelParamsSchema,
} from 'model-bank';

import { aiProviderSelectors, getAiInfraStoreState } from '@/store/aiInfra';
import { useGlobalStore } from '@/store/global';
import { type StoreSetter } from '@/store/types';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/selectors';

import {
  normalizeImageInputOnSchemaSwitch,
  preserveSupportedParams,
} from '../../../utils/preserveSupportedParams';
import type { VideoStore } from '../../store';

export function getVideoModelAndDefaults(model: string, provider: string) {
  const enabledVideoModelList = aiProviderSelectors.enabledVideoModelList(getAiInfraStoreState());

  const providerItem = enabledVideoModelList.find((providerItem) => providerItem.id === provider);
  if (!providerItem) {
    throw new Error(
      `Provider "${provider}" not found in enabled video provider list. Available providers: ${enabledVideoModelList.map((p) => p.id).join(', ')}`,
    );
  }

  const activeModel = providerItem.children.find(
    (modelItem) => modelItem.id === model,
  ) as unknown as AIVideoModelCard;
  if (!activeModel) {
    throw new Error(
      `Model "${model}" not found in provider "${provider}". Available models: ${providerItem.children.map((m) => m.id).join(', ')}`,
    );
  }

  const parametersSchema = activeModel.parameters as VideoModelParamsSchema;
  const defaultValues = extractVideoDefaultValues(parametersSchema);

  return { activeModel, defaultValues, parametersSchema };
}

const schemaSupportsAnyImageParam = (schema: VideoModelParamsSchema) =>
  'imageUrl' in schema || 'imageUrls' in schema;

interface PreserveVideoInputParamsResult {
  heldReferenceImage: string | null;
  parameters: RuntimeVideoGenParams;
}

/**
 * Preserves prompt/reference-image params across a model switch. When the
 * target schema has no image param at all, the outgoing frame is stashed in
 * `heldReferenceImage` (a holding slot) instead of being dropped — switching
 * back to an image-capable model restores it. `previousHeldReferenceImage`
 * lets a hold survive hopping across several imageless models in a row.
 */
function preserveVideoInputParams(
  previousParameters: RuntimeVideoGenParams,
  nextDefaultValues: RuntimeVideoGenParams,
  nextSchema: VideoModelParamsSchema,
  previousHeldReferenceImage: string | null,
): PreserveVideoInputParamsResult {
  const result = preserveSupportedParams(previousParameters, nextDefaultValues, nextSchema, [
    'prompt',
    'imageUrl',
    'imageUrls',
    'endImageUrl',
  ]);

  const normalized = normalizeImageInputOnSchemaSwitch(previousParameters, nextSchema, result);
  const maxImageCount = nextSchema.imageUrls?.maxCount;

  if (Array.isArray(normalized.imageUrls) && typeof maxImageCount === 'number') {
    normalized.imageUrls = normalized.imageUrls.slice(0, maxImageCount);
  }

  if (!schemaSupportsAnyImageParam(nextSchema)) {
    // Target model can't take any image param at all: hold onto whichever frame
    // was outgoing (or keep an already-pending hold from a prior imageless hop)
    // instead of silently dropping it.
    const outgoingImage =
      (typeof previousParameters.imageUrl === 'string' && previousParameters.imageUrl) ||
      (Array.isArray(previousParameters.imageUrls) && previousParameters.imageUrls[0]) ||
      undefined;

    return {
      heldReferenceImage: outgoingImage || previousHeldReferenceImage || null,
      parameters: normalized,
    };
  }

  // Target model can take an image: restore a pending hold, but never clobber a
  // frame that's already carried forward into the new params.
  const hasCarriedFrame =
    Boolean(normalized.imageUrl) ||
    (Array.isArray(normalized.imageUrls) && normalized.imageUrls.length > 0);

  if (previousHeldReferenceImage && !hasCarriedFrame) {
    if ('imageUrl' in nextSchema) {
      normalized.imageUrl = previousHeldReferenceImage;
    } else if ('imageUrls' in nextSchema) {
      normalized.imageUrls = [previousHeldReferenceImage];
    }
  }

  return { heldReferenceImage: null, parameters: normalized };
}

type Setter = StoreSetter<VideoStore>;

export const createGenerationConfigSlice = (set: Setter, get: () => VideoStore, _api?: unknown) =>
  new GenerationConfigActionImpl(set, get, _api);

export class GenerationConfigActionImpl {
  readonly #get: () => VideoStore;
  readonly #set: Setter;

  constructor(set: Setter, get: () => VideoStore, _api?: unknown) {
    void _api;
    this.#get = get;
    this.#set = set;
  }

  initializeVideoConfig = (
    isLogin?: boolean,
    lastSelectedVideoModel?: string,
    lastSelectedVideoProvider?: string,
  ): void => {
    if (isLogin && lastSelectedVideoModel && lastSelectedVideoProvider) {
      try {
        const { defaultValues, parametersSchema } = getVideoModelAndDefaults(
          lastSelectedVideoModel,
          lastSelectedVideoProvider,
        );

        this.#set(
          {
            isInit: true,
            model: lastSelectedVideoModel,
            parameters: defaultValues,
            parametersSchema,
            provider: lastSelectedVideoProvider,
          },
          false,
          `initializeVideoConfig/${lastSelectedVideoModel}/${lastSelectedVideoProvider}`,
        );
      } catch {
        this.#set({ isInit: true }, false, 'initializeVideoConfig/default');
      }
    } else {
      this.#set({ isInit: true }, false, 'initializeVideoConfig/default');
    }
  };

  setModelAndProviderOnSelect = (model: string, provider: string): void => {
    const previousState = this.#get();
    const previousParameters = previousState.parameters;
    const previousHeldReferenceImage = previousState.heldReferenceImage ?? null;
    const { activeModel, defaultValues, parametersSchema } = getVideoModelAndDefaults(
      model,
      provider,
    );
    const { heldReferenceImage, parameters } = preserveVideoInputParams(
      previousParameters,
      defaultValues,
      parametersSchema,
      previousHeldReferenceImage,
    );

    // A frame just entered the holding slot (it wasn't already held before this
    // switch): the target model can't take it at all, so say so instead of
    // silently dropping it.
    const justStartedHolding = !previousHeldReferenceImage && Boolean(heldReferenceImage);

    this.#set(
      {
        heldReferenceImage,
        model,
        parameters,
        parametersSchema,
        provider,
      },
      false,
      `setModelAndProviderOnSelect/${model}/${provider}`,
    );

    if (justStartedHolding) {
      toast.warning({
        description: t('generation.notice.referenceImageHeld', {
          model: activeModel.displayName,
          ns: 'video',
        }),
        duration: 4000,
      });
    }

    const isLogin = authSelectors.isLogin(useUserStore.getState());
    if (isLogin) {
      useGlobalStore.getState().updateSystemStatus({
        lastSelectedVideoModel: model,
        lastSelectedVideoProvider: provider,
      });
    }
  };

  setParamOnInput = <K extends RuntimeVideoGenParamsKeys>(
    paramName: K,
    value: RuntimeVideoGenParamsValue,
  ): void => {
    this.#set(
      (state) => {
        const { parameters } = state;
        return { parameters: { ...parameters, [paramName]: value } };
      },
      false,
      `setParamOnInput/${paramName}`,
    );
  };

  addUploadingImagePreviews = (urls: string[]): void => {
    this.#set(
      (state) => ({ uploadingImagePreviews: [...state.uploadingImagePreviews, ...urls] }),
      false,
      'addUploadingImagePreviews',
    );
  };

  removeUploadingImagePreviews = (urls: string[]): void => {
    this.#set(
      (state) => ({
        uploadingImagePreviews: state.uploadingImagePreviews.filter((url) => !urls.includes(url)),
      }),
      false,
      'removeUploadingImagePreviews',
    );
  };
}

export type GenerationConfigAction = Pick<
  GenerationConfigActionImpl,
  keyof GenerationConfigActionImpl
>;
