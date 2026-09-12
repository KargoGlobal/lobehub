import { handleGenerationPromptModerationError } from '@/business/client/handleGenerationPromptModerationError';
import { handleLobeHubModelDeprecatedError } from '@/business/client/handleLobeHubModelDeprecatedError';
import { imageService } from '@/services/image';
import { type StoreSetter } from '@/store/types';

import { type ImageStore } from '../../store';
import { generationBatchSelectors } from '../generationBatch/selectors';
import { imageGenerationConfigSelectors } from '../generationConfig/selectors';
import { generationTopicSelectors } from '../generationTopic';

const UTILITY_TOOLS = {
  removeBackground: { model: 'fal-ai/birefnet/v2', prompt: 'Remove background' },
  upscale: { model: 'bria/increase-resolution', prompt: 'Upscale 2x' },
} as const;

export type UtilityTool = keyof typeof UTILITY_TOOLS;

/**
 * A one-off edit call whose params vary per invocation (resize target, scene
 * description, relight prompt) — unlike `UTILITY_TOOLS`, which is a fixed
 * model+prompt lookup for zero-parameter tools (remove background, upscale).
 */
export interface EditImageRequest {
  model: string;
  /** Sent to fal as-is; must include `prompt` (server requires it, even when
   * the target endpoint ignores it — it's what shows as the batch label). */
  params: Record<string, unknown>;
}

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

    if (!parameters.prompt) {
      throw new TypeError('prompt is empty');
    }

    // Track the final topic ID to use for image creation
    let finalTopicId = activeGenerationTopicId;

    // 1. Create generation topic if not exists
    const generationTopicId = activeGenerationTopicId;
    let isNewTopic = false;

    if (!generationTopicId) {
      isNewTopic = true;
      const prompts = [parameters.prompt];
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
        params: parameters as any,
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

  async createUtilityImage(sourceImageUrl: string, tool: UtilityTool) {
    this.#set({ isCreating: true }, false, 'createUtilityImage/start');

    const store = this.#get();
    const activeGenerationTopicId = generationTopicSelectors.activeGenerationTopicId(store);
    const { createGenerationTopic, switchGenerationTopic, setTopicBatchLoaded } = store;
    const { model, prompt } = UTILITY_TOOLS[tool];

    let finalTopicId = activeGenerationTopicId;
    let isNewTopic = false;

    if (!activeGenerationTopicId) {
      isNewTopic = true;
      finalTopicId = await createGenerationTopic([prompt]);
      setTopicBatchLoaded(finalTopicId);
      switchGenerationTopic(finalTopicId);
    }

    try {
      await imageService.createImage({
        generationTopicId: finalTopicId!,
        provider: 'fal',
        model,
        imageNum: 1,
        params: { imageUrl: sourceImageUrl, prompt } as any,
      });

      if (!isNewTopic) {
        await this.#get().refreshGenerationBatches();
      }
    } catch (error) {
      handleGenerationPromptModerationError(error);
      handleLobeHubModelDeprecatedError(error);
      throw error;
    } finally {
      this.#set({ isCreating: false }, false, 'createUtilityImage/end');
    }
  }

  /**
   * Runs a single-image edit endpoint (resize/reframe, product-scene
   * placement, relight, ...) with caller-supplied params. Mirrors
   * `createUtilityImage`'s topic bookkeeping; differs only in that the model
   * and params come from the call site instead of a fixed lookup, since these
   * tools take a parameter the zero-config utilities don't.
   */
  async createEditedImage(sourceImageUrl: string, request: EditImageRequest) {
    this.#set({ isCreating: true }, false, 'createEditedImage/start');

    const store = this.#get();
    const activeGenerationTopicId = generationTopicSelectors.activeGenerationTopicId(store);
    const { createGenerationTopic, switchGenerationTopic, setTopicBatchLoaded } = store;
    const { model, params } = request;

    let finalTopicId = activeGenerationTopicId;
    let isNewTopic = false;

    if (!activeGenerationTopicId) {
      isNewTopic = true;
      finalTopicId = await createGenerationTopic([String(params.prompt ?? '')]);
      setTopicBatchLoaded(finalTopicId);
      switchGenerationTopic(finalTopicId);
    }

    try {
      await imageService.createImage({
        generationTopicId: finalTopicId!,
        provider: 'fal',
        model,
        imageNum: 1,
        params: { imageUrl: sourceImageUrl, ...params } as any,
      });

      if (!isNewTopic) {
        await this.#get().refreshGenerationBatches();
      }
    } catch (error) {
      handleGenerationPromptModerationError(error);
      handleLobeHubModelDeprecatedError(error);
      throw error;
    } finally {
      this.#set({ isCreating: false }, false, 'createEditedImage/end');
    }
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
