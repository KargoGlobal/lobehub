import type { AIImageModelCard, ModelParamsSchema, RuntimeImageGenParams } from 'model-bank';
import { gptImage1Schema } from 'model-bank';
import { describe, expect, it, vi } from 'vitest';

import { type ImageStore } from '@/store/image';
import { initialState } from '@/store/image/initialState';
import { merge } from '@/utils/merge';

import { DEFAULT_AI_IMAGE_MODEL, DEFAULT_AI_IMAGE_PROVIDER } from './initialState';
import { imageGenerationConfigSelectors } from './selectors';

// Mock external dependencies
vi.mock('@/store/aiInfra', () => ({
  aiProviderSelectors: {
    enabledImageModelList: vi.fn(() => [
      {
        id: 'openai',
        name: 'OpenAI',
        children: [
          {
            id: 'gpt-image-1',
            displayName: 'GPT Image 1',
            type: 'image',
            parameters: gptImage1Schema,
            releasedAt: '2024-12-01',
          } as AIImageModelCard,
        ],
      },
    ]),
  },
  getAiInfraStoreState: vi.fn(() => ({})),
}));

const initialStore = initialState as ImageStore;

const testModelSchema: ModelParamsSchema = {
  imageUrls: { default: [] },
  prompt: { default: '' },
  size: {
    default: 'auto',
    enum: ['auto', '1024x1024', '1536x1024', '1024x1536'],
  },
};

const testParameters: RuntimeImageGenParams = {
  imageUrls: [],
  prompt: 'test prompt',
  size: 'auto',
};

describe('imageGenerationConfigSelectors', () => {
  describe('model', () => {
    it('should return the current model', () => {
      const state = merge(initialStore, { model: 'gpt-image-1' });
      const result = imageGenerationConfigSelectors.model(state);
      expect(result).toBe('gpt-image-1');
    });

    it('should return the default model from initial state', () => {
      const result = imageGenerationConfigSelectors.model(initialStore);
      expect(result).toBe(DEFAULT_AI_IMAGE_MODEL);
    });
  });

  describe('provider', () => {
    it('should return the current provider', () => {
      const state = merge(initialStore, { provider: 'openai' });
      const result = imageGenerationConfigSelectors.provider(state);
      expect(result).toBe('openai');
    });

    it('should return the default provider from initial state', () => {
      const result = imageGenerationConfigSelectors.provider(initialStore);
      expect(result).toBe(DEFAULT_AI_IMAGE_PROVIDER);
    });
  });

  describe('imageNum', () => {
    it('should return the current imageNum', () => {
      const state = merge(initialStore, { imageNum: 4 });
      const result = imageGenerationConfigSelectors.imageNum(state);
      expect(result).toBe(4);
    });

    it('should return default imageNum when not set', () => {
      const state = merge(initialStore, { imageNum: 1 });
      const result = imageGenerationConfigSelectors.imageNum(state);
      expect(result).toBe(1);
    });

    it('should handle different imageNum values', () => {
      const state = merge(initialStore, { imageNum: 8 });
      const result = imageGenerationConfigSelectors.imageNum(state);
      expect(result).toBe(8);
    });
  });

  describe('parameters', () => {
    it('should return the current parameters', () => {
      const state = merge(initialStore, { parameters: testParameters });
      const result = imageGenerationConfigSelectors.parameters(state);
      // merge does deep merge, so result contains both default and test values
      expect(result.prompt).toBe(testParameters.prompt);
      expect(result.size).toBe(testParameters.size);
      expect(result.imageUrls).toEqual(testParameters.imageUrls);
    });

    it('should return the default parameters from initial state', () => {
      const result = imageGenerationConfigSelectors.parameters(initialStore);
      expect(result).toBeDefined();
      expect(typeof result.prompt).toBe('string');
    });

    it('should handle custom parameters object', () => {
      const customParams = { prompt: 'custom', width: 2048 } as RuntimeImageGenParams;
      const state = merge(initialStore, { parameters: customParams });
      const result = imageGenerationConfigSelectors.parameters(state);
      expect(result.prompt).toBe('custom');
      expect(result.width).toBe(2048);
    });
  });

  describe('parametersSchema', () => {
    it('should return the current parametersSchema', () => {
      const state = merge(initialStore, { parametersSchema: testModelSchema });
      const result = imageGenerationConfigSelectors.parametersSchema(state);
      // merge does deep merge, so result contains both default and test values
      expect(result.prompt).toEqual(testModelSchema.prompt);
      expect(result.size).toEqual(testModelSchema.size);
      expect(result.imageUrls).toEqual(testModelSchema.imageUrls);
    });

    it('should return default parametersSchema when not explicitly overridden', () => {
      // merge function doesn't override with undefined, so we get the default from initialState
      const result = imageGenerationConfigSelectors.parametersSchema(initialStore);
      expect(result).toBeDefined();
      expect(result.prompt).toBeDefined();
    });

    it('should handle parametersSchema deep merge', () => {
      const customSchema: ModelParamsSchema = {
        prompt: { default: 'custom prompt' },
        size: { default: '1024x1024', enum: ['1024x1024', '512x512'] },
      };
      const state = merge(initialStore, { parametersSchema: customSchema });
      const result = imageGenerationConfigSelectors.parametersSchema(state);

      // merge function does deep merge, so we should expect merged result
      expect(result.prompt.default).toBe('custom prompt');
      expect(result.size?.default).toBe('1024x1024');
      expect(result.size?.enum).toEqual(['1024x1024', '512x512']);
      // Original keys should still exist
      expect(result.imageUrls).toBeDefined();
      expect(result.prompt).toBeDefined();
    });
  });

  describe('isSupportParam', () => {
    it('should return true when parameter exists in parametersSchema', () => {
      const state = merge(initialStore, { parametersSchema: testModelSchema });
      const result = imageGenerationConfigSelectors.isSupportedParam('size')(state);
      expect(result).toBe(true);
    });

    it('should return false when parameter does not exist in parametersSchema', () => {
      const state = merge(initialStore, { parametersSchema: testModelSchema });
      const result = imageGenerationConfigSelectors.isSupportedParam('nonexistent' as any)(state);
      expect(result).toBe(false);
    });

    it('should return true for supported params in default parametersSchema', () => {
      // Since merge doesn't override with undefined, we get the default parametersSchema from initialState
      const result = imageGenerationConfigSelectors.isSupportedParam('prompt')(initialStore);
      expect(result).toBe(true);
    });

    it('should return false when parameter does not exist in merged parametersSchema', () => {
      // Since merge does deep merge, original params still exist, so test a param that truly doesn't exist
      const result = imageGenerationConfigSelectors.isSupportedParam('nonExistentParam' as any)(
        initialStore,
      );
      expect(result).toBe(false);
    });

    it('should handle various parameter types', () => {
      const state = merge(initialStore, { parametersSchema: testModelSchema });

      expect(imageGenerationConfigSelectors.isSupportedParam('prompt')(state)).toBe(true);
      expect(imageGenerationConfigSelectors.isSupportedParam('size')(state)).toBe(true);
      expect(imageGenerationConfigSelectors.isSupportedParam('imageUrls')(state)).toBe(true);
      expect(
        imageGenerationConfigSelectors.isSupportedParam('nonExistentParam' as any)(state),
      ).toBe(false);
    });

    it('should work correctly with gpt-image-1 parameters', () => {
      const state = merge(initialStore, { parametersSchema: gptImage1Schema });

      // Test some known gpt-image-1 parameters
      expect(imageGenerationConfigSelectors.isSupportedParam('prompt')(state)).toBe(true);
      expect(imageGenerationConfigSelectors.isSupportedParam('size')(state)).toBe(true);
      expect(imageGenerationConfigSelectors.isSupportedParam('imageUrls')(state)).toBe(true);

      // Test parameter that doesn't exist
      expect(imageGenerationConfigSelectors.isSupportedParam('nonexistent' as any)(state)).toBe(
        false,
      );
    });
  });

  describe('hasConfigurableParams', () => {
    // `merge` deep-merges onto the initial state's own schema (which has
    // aspectRatio/resolution), so it can't produce a genuinely prompt-only
    // schema for these cases; spread to replace `parametersSchema` outright.
    it('should return false for a prompt-only schema (nothing for the Configuration popover to render)', () => {
      const promptOnlySchema: ModelParamsSchema = {
        prompt: { default: '' },
      };
      const state = { ...initialStore, parametersSchema: promptOnlySchema };
      expect(imageGenerationConfigSelectors.hasConfigurableParams(state)).toBe(false);
    });

    it('should return false when only reference-image params are present', () => {
      const referenceOnlySchema: ModelParamsSchema = {
        imageUrl: { default: null },
        imageUrls: { default: [] },
        prompt: { default: '' },
      };
      const state = { ...initialStore, parametersSchema: referenceOnlySchema };
      expect(imageGenerationConfigSelectors.hasConfigurableParams(state)).toBe(false);
    });

    it('should return true when the schema has an aspectRatio param', () => {
      const schema: ModelParamsSchema = {
        aspectRatio: { default: '16:9', enum: ['1:1', '16:9'] },
        imageUrls: { default: [] },
        prompt: { default: '' },
      };
      const state = { ...initialStore, parametersSchema: schema };
      expect(imageGenerationConfigSelectors.hasConfigurableParams(state)).toBe(true);
    });

    it('should return true for gpt-image-1 (has a size param)', () => {
      const state = { ...initialStore, parametersSchema: gptImage1Schema };
      expect(imageGenerationConfigSelectors.hasConfigurableParams(state)).toBe(true);
    });
  });
});
