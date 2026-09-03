import { isPromptlessImageModel } from 'model-bank';

import { handleGenerationPromptModerationError } from '@/business/client/handleGenerationPromptModerationError';
import { handleLobeHubModelDeprecatedError } from '@/business/client/handleLobeHubModelDeprecatedError';
import { imageService } from '@/services/image';
import { getAiInfraStoreState } from '@/store/aiInfra';
import { aiProviderSelectors } from '@/store/aiInfra/selectors';
import { type StoreSetter } from '@/store/types';

import { type ImageStore } from '../../store';
import { generationBatchSelectors } from '../generationBatch/selectors';
import { imageGenerationConfigSelectors } from '../generationConfig/selectors';
import { generationTopicSelectors } from '../generationTopic';

/** Stands in for the prompt on promptless models; names the topic and the file. */
const PROMPTLESS_PROMPT_LABEL = 'Remove background';

/** Kargo policy is fal-only endpoints, so background removal is pinned to fal. */
const BACKGROUND_REMOVAL_MODEL = { model: 'fal-ai/birefnet/v2', provider: 'fal' } as const;

type Setter = StoreSetter<ImageStore>;
export const createCreateImageSlice = (set: Setter, get: () => ImageStore, _api?: unknown) =>
  new CreateImageActionImpl(set, get, _api);

export class CreateImageActionImpl {
  readonly #get: () => ImageStore;
  readonly #set: Setter;

  constructor(set: Setter, get: () => ImageStore, _api?: unknown) {
    // keep signature aligned with StateCreator params: (set, get, api)
    void _api;
    this.#set = set;
    this.#get = get;
  }

  async createImage() {
    this.#set({ isCreating: true }, false, 'createImage/startCreateImage');

    const store = this.#get();
    const imageNum = imageGenerationConfigSelectors.imageNum(store);
    const parameters = imageGenerationConfigSelectors.parameters(store);
    const provider = imageGenerationConfigSelectors.provider(store);
    const model = imageGenerationConfigSelectors.model(store);
    const activeGenerationTopicId = generationTopicSelectors.activeGenerationTopicId(store);
    const { createGenerationTopic, switchGenerationTopic, setTopicBatchLoaded } = store;

    if (!parameters) {
      throw new TypeError('parameters is not initialized');
    }

    // Models like background removal take an image and no prompt. They still
    // need a non-empty label — it names the topic and the downloaded file — so
    // substitute one rather than rejecting the submission. Copied rather than
    // mutated: `parameters` is live store state.
    const submitParameters =
      isPromptlessImageModel(model) && !parameters.prompt
        ? { ...parameters, prompt: PROMPTLESS_PROMPT_LABEL }
        : parameters;

    if (!submitParameters.prompt) {
      throw new TypeError('prompt is empty');
    }

    // Track the final topic ID to use for image creation
    let finalTopicId = activeGenerationTopicId;

    // 1. Create generation topic if not exists
    const generationTopicId = activeGenerationTopicId;
    let isNewTopic = false;

    if (!generationTopicId) {
      isNewTopic = true;
      const prompts = [submitParameters.prompt];
      const newGenerationTopicId = await createGenerationTopic(prompts);
      finalTopicId = newGenerationTopicId;

      // 2. Initialize empty batch array to avoid skeleton screen
      setTopicBatchLoaded(newGenerationTopicId);

      // 3. Switch to the new topic (now it has empty data, so no skeleton screen)
      switchGenerationTopic(newGenerationTopicId);
    }

    try {
      // 4. If it's a new topic, set the creating state after topic creation
      if (isNewTopic) {
        this.#set(
          { isCreatingWithNewTopic: true },
          false,
          'createImage/startCreateImageWithNewTopic',
        );
      }

      // 5. Create image via service
      await imageService.createImage({
        generationTopicId: finalTopicId!,
        provider,
        model,
        imageNum,
        params: submitParameters as any,
      });

      // 6. Only refresh generation batches if it's not a new topic
      if (!isNewTopic) {
        await this.#get().refreshGenerationBatches();
      }

      // 7. Clear the prompt input after successful image creation
      this.#set(
        (state) => ({
          parameters: { ...state.parameters, prompt: '' },
        }),
        false,
        'createImage/clearPrompt',
      );
    } catch (error) {
      handleGenerationPromptModerationError(error);
      handleLobeHubModelDeprecatedError(error);
      throw error;
    } finally {
      // 8. Reset all creating states
      if (isNewTopic) {
        this.#set(
          { isCreating: false, isCreatingWithNewTopic: false },
          false,
          'createImage/endCreateImageWithNewTopic',
        );
      } else {
        this.#set({ isCreating: false }, false, 'createImage/endCreateImage');
      }
    }
  }

  /**
   * One-click background removal for an image already in the feed.
   *
   * Switches the workspace to the background-removal model and submits that
   * image, which is how a designer thinks about it — "cut this one out" —
   * rather than making them find the model and re-upload. The model swap must
   * come first: `setModelAndProviderOnSelect` rebuilds `parameters` from the
   * new model's defaults and only carries image inputs across.
   */
  async removeBackground(imageUrl: string) {
    const store = this.#get();

    const isAvailable = aiProviderSelectors
      .enabledImageModelList(getAiInfraStoreState())
      .some((group) =>
        group.children.some((model) => model.id === BACKGROUND_REMOVAL_MODEL.model),
      );

    if (!isAvailable) {
      throw new Error(
        `${BACKGROUND_REMOVAL_MODEL.model} is not enabled — turn on the Fal provider in settings.`,
      );
    }

    store.setModelAndProviderOnSelect(
      BACKGROUND_REMOVAL_MODEL.model,
      BACKGROUND_REMOVAL_MODEL.provider,
    );
    this.#get().setParamOnInput('imageUrl', imageUrl);

    await this.#get().createImage();
  }

  async recreateImage(generationBatchId: string) {
    this.#set({ isCreating: true }, false, 'recreateImage/startCreateImage');

    const store = this.#get();
    const activeGenerationTopicId = generationTopicSelectors.activeGenerationTopicId(store);
    if (!activeGenerationTopicId) {
      throw new Error('No active generation topic');
    }

    const { removeGenerationBatch } = store;
    const batch = generationBatchSelectors.getGenerationBatchByBatchId(generationBatchId)(store)!;

    // Use batch.generations.length to preserve original imageNum (not UI config)
    const imageNum = batch.generations.length;

    try {
      // 1. Delete generation batch
      await removeGenerationBatch(generationBatchId, activeGenerationTopicId);

      // 2. Create image via service
      await imageService.createImage({
        generationTopicId: activeGenerationTopicId,
        provider: batch.provider,
        model: batch.model,
        imageNum,
        params: batch.config as any,
      });

      // 3. Refresh generation batches to show the real data
      await store.refreshGenerationBatches();
    } catch (error) {
      handleGenerationPromptModerationError(error);
      handleLobeHubModelDeprecatedError(error);
      throw error;
    } finally {
      this.#set({ isCreating: false }, false, 'recreateImage/endCreateImage');
    }
  }
}

export type CreateImageAction = Pick<CreateImageActionImpl, keyof CreateImageActionImpl>;
