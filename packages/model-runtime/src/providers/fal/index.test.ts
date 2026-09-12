// @vitest-environment node
import { fal } from '@fal-ai/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreateImagePayload } from '../../types';
import { LobeFalAI } from './index';

// Mock the fal client
vi.mock('@fal-ai/client', () => ({
  fal: {
    config: vi.fn(),
    queue: {
      result: vi.fn(),
      status: vi.fn(),
      submit: vi.fn(),
    },
    subscribe: vi.fn(),
  },
}));

// Get the mocked fal instance
const mockFal = vi.mocked(fal);

// Mock the console.error to avoid polluting test output
vi.spyOn(console, 'error').mockImplementation(() => {});

const provider = 'fal';
const bizErrorType = 'ProviderBizError';
const invalidErrorType = 'InvalidProviderAPIKey';

let instance: LobeFalAI;

beforeEach(() => {
  vi.clearAllMocks();
  instance = new LobeFalAI({ apiKey: 'test-api-key' });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('LobeFalAI', () => {
  describe('init', () => {
    it('should correctly initialize with an API key', () => {
      const instance = new LobeFalAI({ apiKey: 'test_api_key' });
      expect(instance).toBeInstanceOf(LobeFalAI);
      expect(mockFal.config).toHaveBeenCalledWith({
        credentials: 'test_api_key',
      });
    });

    it('should throw InvalidProviderAPIKey if no apiKey is provided', () => {
      expect(() => {
        new LobeFalAI({});
      }).toThrow();
    });

    it('should throw InvalidProviderAPIKey if apiKey is undefined', () => {
      expect(() => {
        new LobeFalAI({ apiKey: undefined });
      }).toThrow();
    });
  });

  describe('createImage', () => {
    it('should create image successfully with basic parameters', async () => {
      // Arrange
      const mockImageResponse = {
        requestId: 'test-request-id',
        data: {
          images: [
            {
              url: 'https://example.com/image.jpg',
              width: 1024,
              height: 1024,
            },
          ],
        },
      };
      mockFal.subscribe.mockResolvedValue(mockImageResponse as any);

      const payload: CreateImagePayload = {
        model: 'flux/dev',
        params: {
          prompt: 'A beautiful landscape',
          width: 1024,
          height: 1024,
        },
      };

      // Act
      const result = await instance.createImage(payload);

      // Assert
      expect(mockFal.subscribe).toHaveBeenCalledWith('fal-ai/flux/dev', {
        input: {
          enable_safety_checker: false,
          num_images: 1,
          prompt: 'A beautiful landscape',
          image_size: {
            width: 1024,
            height: 1024,
          },
        },
      });
      expect(result).toEqual({
        imageUrl: 'https://example.com/image.jpg',
        width: 1024,
        height: 1024,
      });
    });

    it('should parse a singular `image` response (e.g. birefnet, bria utility endpoints)', async () => {
      mockFal.subscribe.mockResolvedValue({
        data: {
          image: {
            url: 'https://example.com/no-bg.png',
            width: 800,
            height: 600,
          },
        },
        requestId: 'test-request-id',
      } as any);

      const result = await instance.createImage({
        model: 'birefnet/v2',
        params: { imageUrl: 'https://example.com/source.jpg' } as any,
      });

      expect(result).toEqual({
        imageUrl: 'https://example.com/no-bg.png',
        width: 800,
        height: 600,
      });
    });

    it('should use mapped model id for fal endpoint requests', async () => {
      const mappedInstance = new LobeFalAI({
        apiKey: 'test-api-key',
        modelIdMapping: { 'logical-fal-image': 'fal-ai/upstream/image-model' },
      });
      mockFal.subscribe.mockResolvedValue({
        data: {
          images: [{ url: 'https://example.com/mapped.jpg' }],
        },
        requestId: 'test-request-id',
      } as any);

      await mappedInstance.createImage({
        model: 'logical-fal-image',
        params: { prompt: 'A mapped image' },
      });

      expect(mockFal.subscribe).toHaveBeenCalledWith('fal-ai/upstream/image-model', {
        input: {
          enable_safety_checker: false,
          num_images: 1,
          prompt: 'A mapped image',
        },
      });
    });

    it('should map standard parameters to fal-specific parameters', async () => {
      // Arrange
      const mockImageResponse = {
        requestId: 'test-request-id',
        data: {
          images: [
            {
              url: 'https://example.com/image.jpg',
              width: 512,
              height: 512,
            },
          ],
        },
      };
      mockFal.subscribe.mockResolvedValue(mockImageResponse as any);

      const payload: CreateImagePayload = {
        model: 'flux/dev',
        params: {
          prompt: 'Test image',
          width: 512,
          height: 512,
          steps: 20,
          cfg: 7.5,
          imageUrl: 'https://example.com/input.jpg',
        },
      };

      // Act
      await instance.createImage(payload);

      // Assert
      expect(mockFal.subscribe).toHaveBeenCalledWith('fal-ai/flux/dev', {
        input: {
          enable_safety_checker: false,
          num_images: 1,
          prompt: 'Test image',
          image_size: {
            width: 512,
            height: 512,
          },
          num_inference_steps: 20,
          guidance_scale: 7.5,
          image_url: 'https://example.com/input.jpg',
        },
      });
    });

    it('should map aspectRatio to aspect_ratio (regression: FLUX Kontext / Imagen 4 picker had no effect)', async () => {
      const mockImageResponse = {
        requestId: 'test-request-id',
        data: { images: [{ url: 'https://example.com/image.jpg' }] },
      };
      mockFal.subscribe.mockResolvedValue(mockImageResponse as any);

      const payload: CreateImagePayload = {
        model: 'flux-pro/kontext',
        params: { prompt: 'Test image', aspectRatio: '16:9' } as any,
      };

      await instance.createImage(payload);

      const [, { input }] = mockFal.subscribe.mock.calls[0] as any;
      expect(input).toHaveProperty('aspect_ratio', '16:9');
      expect(input).not.toHaveProperty('aspectRatio');
    });

    it('should map imageUrls parameter to image_urls', async () => {
      // Arrange
      const mockImageResponse = {
        requestId: 'test-request-id',
        data: {
          images: [
            {
              url: 'https://example.com/image.jpg',
              width: 512,
              height: 512,
            },
          ],
        },
      };
      mockFal.subscribe.mockResolvedValue(mockImageResponse as any);

      const payload: CreateImagePayload = {
        model: 'flux/dev',
        params: {
          prompt: 'Test with multiple images',
          imageUrls: ['https://example.com/input1.jpg', 'https://example.com/input2.jpg'],
        },
      };

      // Act
      await instance.createImage(payload);

      // Assert
      expect(mockFal.subscribe).toHaveBeenCalledWith('fal-ai/flux/dev', {
        input: {
          enable_safety_checker: false,
          num_images: 1,
          prompt: 'Test with multiple images',
          image_urls: ['https://example.com/input1.jpg', 'https://example.com/input2.jpg'],
        },
      });
    });

    it('should handle parameters without width and height', async () => {
      // Arrange
      const mockImageResponse = {
        requestId: 'test-request-id',
        data: {
          images: [
            {
              url: 'https://example.com/image.jpg',
              width: 1024,
              height: 1024,
            },
          ],
        },
      };
      mockFal.subscribe.mockResolvedValue(mockImageResponse as any);

      const payload: CreateImagePayload = {
        model: 'flux/schnell',
        params: {
          prompt: 'Simple test',
          steps: 10,
        },
      };

      // Act
      await instance.createImage(payload);

      // Assert
      expect(mockFal.subscribe).toHaveBeenCalledWith('fal-ai/flux/schnell', {
        input: {
          enable_safety_checker: false,
          num_images: 1,
          prompt: 'Simple test',
          num_inference_steps: 10,
        },
      });
    });

    it('should handle custom parameters that are not in the mapping', async () => {
      // Arrange
      const mockImageResponse = {
        requestId: 'test-request-id',
        data: {
          images: [
            {
              url: 'https://example.com/image.jpg',
              width: 768,
              height: 768,
            },
          ],
        },
      };
      mockFal.subscribe.mockResolvedValue(mockImageResponse as any);

      const payload: CreateImagePayload = {
        model: 'flux/dev',
        params: {
          prompt: 'Custom test',
          width: 768,
          height: 768,
          seed: 12345,
        } as any, // Use any to allow custom parameters
      };

      // Act
      await instance.createImage(payload);

      // Assert
      expect(mockFal.subscribe).toHaveBeenCalledWith('fal-ai/flux/dev', {
        input: {
          enable_safety_checker: false,
          num_images: 1,
          prompt: 'Custom test',
          image_size: {
            width: 768,
            height: 768,
          },
          seed: 12345,
        },
      });
    });

    it('should return only imageUrl when width and height are not provided in response', async () => {
      // Arrange
      const mockImageResponse = {
        requestId: 'test-request-id',
        data: {
          images: [
            {
              url: 'https://example.com/image.jpg',
            },
          ],
        },
      };
      mockFal.subscribe.mockResolvedValue(mockImageResponse as any);

      const payload: CreateImagePayload = {
        model: 'flux/dev',
        params: {
          prompt: 'Test without dimensions',
        },
      };

      // Act
      const result = await instance.createImage(payload);

      // Assert
      expect(result).toEqual({
        imageUrl: 'https://example.com/image.jpg',
      });
    });

    describe('Error handling', () => {
      it('should throw InvalidProviderAPIKey on 401 error', async () => {
        // Arrange
        const apiError = new Error('Unauthorized') as Error & { status: number };
        apiError.status = 401;
        mockFal.subscribe.mockRejectedValue(apiError);

        const payload: CreateImagePayload = {
          model: 'flux/dev',
          params: {
            prompt: 'Test image',
          },
        };

        // Act & Assert
        await expect(instance.createImage(payload)).rejects.toEqual({
          error: { error: apiError },
          errorType: invalidErrorType,
        });
      });

      it('should throw ProviderBizError on other errors', async () => {
        // Arrange
        const apiError = new Error('Some other error');
        mockFal.subscribe.mockRejectedValue(apiError);

        const payload: CreateImagePayload = {
          model: 'flux/dev',
          params: {
            prompt: 'Test image',
          },
        };

        // Act & Assert
        await expect(instance.createImage(payload)).rejects.toEqual({
          error: { error: apiError },
          errorType: bizErrorType,
        });
      });

      it('should throw ProviderBizError on non-401 status errors', async () => {
        // Arrange
        const apiError = new Error('Server error') as Error & { status: number };
        apiError.status = 500;
        mockFal.subscribe.mockRejectedValue(apiError);

        const payload: CreateImagePayload = {
          model: 'flux/dev',
          params: {
            prompt: 'Test image',
          },
        };

        // Act & Assert
        await expect(instance.createImage(payload)).rejects.toEqual({
          error: { error: apiError },
          errorType: bizErrorType,
        });
      });
    });

    describe('Parameter filtering', () => {
      it('should filter out null values', async () => {
        // Arrange
        const mockImageResponse = {
          requestId: 'test-request-id',
          data: {
            images: [
              {
                url: 'https://example.com/image.jpg',
              },
            ],
          },
        };
        mockFal.subscribe.mockResolvedValue(mockImageResponse as any);

        const payload: CreateImagePayload = {
          model: 'flux/dev',
          params: {
            prompt: 'Test with null values',
            imageUrl: null,
            steps: null,
            cfg: 7.5,
          } as any,
        };

        // Act
        await instance.createImage(payload);

        // Assert
        expect(mockFal.subscribe).toHaveBeenCalledWith('fal-ai/flux/dev', {
          input: {
            enable_safety_checker: false,
            num_images: 1,
            prompt: 'Test with null values',
            guidance_scale: 7.5,
          },
        });
      });

      it('should filter out undefined values', async () => {
        // Arrange
        const mockImageResponse = {
          requestId: 'test-request-id',
          data: {
            images: [
              {
                url: 'https://example.com/image.jpg',
              },
            ],
          },
        };
        mockFal.subscribe.mockResolvedValue(mockImageResponse as any);

        const payload: CreateImagePayload = {
          model: 'flux/dev',
          params: {
            prompt: 'Test with undefined values',
            imageUrl: undefined,
            steps: undefined,
            cfg: 5,
          } as any,
        };

        // Act
        await instance.createImage(payload);

        // Assert
        expect(mockFal.subscribe).toHaveBeenCalledWith('fal-ai/flux/dev', {
          input: {
            enable_safety_checker: false,
            num_images: 1,
            prompt: 'Test with undefined values',
            guidance_scale: 5,
          },
        });
      });

      it('should filter out empty arrays', async () => {
        // Arrange
        const mockImageResponse = {
          requestId: 'test-request-id',
          data: {
            images: [
              {
                url: 'https://example.com/image.jpg',
              },
            ],
          },
        };
        mockFal.subscribe.mockResolvedValue(mockImageResponse as any);

        const payload: CreateImagePayload = {
          model: 'flux/dev',
          params: {
            prompt: 'Test with empty arrays',
            imageUrls: [],
            steps: 20,
          } as any,
        };

        // Act
        await instance.createImage(payload);

        // Assert
        expect(mockFal.subscribe).toHaveBeenCalledWith('fal-ai/flux/dev', {
          input: {
            enable_safety_checker: false,
            num_images: 1,
            prompt: 'Test with empty arrays',
            num_inference_steps: 20,
          },
        });
      });
    });

    describe('Seedream and Hunyuan special endpoints', () => {
      it('should use text-to-image endpoint when no imageUrls provided', async () => {
        // Arrange
        const mockImageResponse = {
          requestId: 'test-request-id',
          data: {
            images: [
              {
                url: 'https://example.com/generated.jpg',
                width: 1024,
                height: 1024,
              },
            ],
          },
        };
        mockFal.subscribe.mockResolvedValue(mockImageResponse as any);

        const payload: CreateImagePayload = {
          model: 'bytedance/seedream/v4',
          params: {
            prompt: 'A beautiful landscape',
            width: 1024,
            height: 1024,
          },
        };

        // Act
        await instance.createImage(payload);

        // Assert
        expect(mockFal.subscribe).toHaveBeenCalledWith(
          'fal-ai/bytedance/seedream/v4/text-to-image',
          {
            input: {
              enable_safety_checker: false,
              num_images: 1,
              prompt: 'A beautiful landscape',
              image_size: {
                width: 1024,
                height: 1024,
              },
            },
          },
        );
      });

      it('should use edit endpoint when imageUrls is provided', async () => {
        // Arrange
        const mockImageResponse = {
          requestId: 'test-request-id',
          data: {
            images: [
              {
                url: 'https://example.com/edited.jpg',
                width: 1024,
                height: 1024,
              },
            ],
          },
        };
        mockFal.subscribe.mockResolvedValue(mockImageResponse as any);

        const payload: CreateImagePayload = {
          model: 'bytedance/seedream/v4',
          params: {
            prompt: 'Edit this image to add a sunset',
            imageUrls: ['https://example.com/input.jpg'],
            width: 1024,
            height: 1024,
          },
        };

        // Act
        await instance.createImage(payload);

        // Assert
        expect(mockFal.subscribe).toHaveBeenCalledWith('fal-ai/bytedance/seedream/v4/edit', {
          input: {
            enable_safety_checker: false,
            num_images: 1,
            prompt: 'Edit this image to add a sunset',
            image_urls: ['https://example.com/input.jpg'],
            image_size: {
              width: 1024,
              height: 1024,
            },
          },
        });
      });

      it('should use edit endpoint when multiple imageUrls are provided', async () => {
        // Arrange
        const mockImageResponse = {
          requestId: 'test-request-id',
          data: {
            images: [
              {
                url: 'https://example.com/edited.jpg',
                width: 1024,
                height: 1024,
              },
            ],
          },
        };
        mockFal.subscribe.mockResolvedValue(mockImageResponse as any);

        const payload: CreateImagePayload = {
          model: 'bytedance/seedream/v4',
          params: {
            prompt: 'Combine these images',
            imageUrls: ['https://example.com/input1.jpg', 'https://example.com/input2.jpg'],
            width: 1024,
            height: 1024,
          },
        };

        // Act
        await instance.createImage(payload);

        // Assert
        expect(mockFal.subscribe).toHaveBeenCalledWith('fal-ai/bytedance/seedream/v4/edit', {
          input: {
            enable_safety_checker: false,
            num_images: 1,
            prompt: 'Combine these images',
            image_urls: ['https://example.com/input1.jpg', 'https://example.com/input2.jpg'],
            image_size: {
              width: 1024,
              height: 1024,
            },
          },
        });
      });

      it('should use text-to-image endpoint when imageUrls is empty array', async () => {
        // Arrange
        const mockImageResponse = {
          requestId: 'test-request-id',
          data: {
            images: [
              {
                url: 'https://example.com/generated.jpg',
                width: 1024,
                height: 1024,
              },
            ],
          },
        };
        mockFal.subscribe.mockResolvedValue(mockImageResponse as any);

        const payload: CreateImagePayload = {
          model: 'bytedance/seedream/v4',
          params: {
            prompt: 'Generate new image',
            imageUrls: [],
            width: 1024,
            height: 1024,
          } as any,
        };

        // Act
        await instance.createImage(payload);

        // Assert
        expect(mockFal.subscribe).toHaveBeenCalledWith(
          'fal-ai/bytedance/seedream/v4/text-to-image',
          {
            input: {
              enable_safety_checker: false,
              num_images: 1,
              prompt: 'Generate new image',
              image_size: {
                width: 1024,
                height: 1024,
              },
            },
          },
        );
      });

      it('should handle seedream v4 with other parameters', async () => {
        // Arrange
        const mockImageResponse = {
          requestId: 'test-request-id',
          data: {
            images: [
              {
                url: 'https://example.com/edited.jpg',
              },
            ],
          },
        };
        mockFal.subscribe.mockResolvedValue(mockImageResponse as any);

        const payload: CreateImagePayload = {
          model: 'bytedance/seedream/v4',
          params: {
            prompt: 'Edit with custom settings',
            imageUrls: ['https://example.com/input.jpg'],
            steps: 30,
            cfg: 8,
          },
        };

        // Act
        await instance.createImage(payload);

        // Assert
        expect(mockFal.subscribe).toHaveBeenCalledWith('fal-ai/bytedance/seedream/v4/edit', {
          input: {
            enable_safety_checker: false,
            num_images: 1,
            prompt: 'Edit with custom settings',
            image_urls: ['https://example.com/input.jpg'],
            num_inference_steps: 30,
            guidance_scale: 8,
          },
        });
      });

      it('should use text-to-image endpoint for seedream v4.5 when no imageUrls provided', async () => {
        // Arrange
        const mockImageResponse = {
          requestId: 'test-request-id',
          data: {
            images: [
              {
                url: 'https://example.com/generated.jpg',
                width: 2048,
                height: 2048,
              },
            ],
          },
        };
        mockFal.subscribe.mockResolvedValue(mockImageResponse as any);

        const payload: CreateImagePayload = {
          model: 'bytedance/seedream/v4.5',
          params: {
            prompt: 'A beautiful landscape',
            width: 2048,
            height: 2048,
          },
        };

        // Act
        await instance.createImage(payload);

        // Assert
        expect(mockFal.subscribe).toHaveBeenCalledWith(
          'fal-ai/bytedance/seedream/v4.5/text-to-image',
          {
            input: {
              enable_safety_checker: false,
              num_images: 1,
              prompt: 'A beautiful landscape',
              image_size: {
                width: 2048,
                height: 2048,
              },
            },
          },
        );
      });

      it('should use edit endpoint for seedream v4.5 when imageUrls is provided', async () => {
        // Arrange
        const mockImageResponse = {
          requestId: 'test-request-id',
          data: {
            images: [
              {
                url: 'https://example.com/edited.jpg',
                width: 2048,
                height: 2048,
              },
            ],
          },
        };
        mockFal.subscribe.mockResolvedValue(mockImageResponse as any);

        const payload: CreateImagePayload = {
          model: 'bytedance/seedream/v4.5',
          params: {
            prompt: 'Edit this image',
            imageUrls: ['https://example.com/input.jpg'],
            width: 2048,
            height: 2048,
          },
        };

        // Act
        await instance.createImage(payload);

        // Assert
        expect(mockFal.subscribe).toHaveBeenCalledWith('fal-ai/bytedance/seedream/v4.5/edit', {
          input: {
            enable_safety_checker: false,
            num_images: 1,
            prompt: 'Edit this image',
            image_urls: ['https://example.com/input.jpg'],
            image_size: {
              width: 2048,
              height: 2048,
            },
          },
        });
      });

      it('should use text-to-image endpoint for hunyuan-image v3 when no imageUrls provided', async () => {
        // Arrange
        const mockImageResponse = {
          requestId: 'test-request-id',
          data: {
            images: [
              {
                url: 'https://example.com/generated.jpg',
                width: 1024,
                height: 1024,
              },
            ],
          },
        };
        mockFal.subscribe.mockResolvedValue(mockImageResponse as any);

        const payload: CreateImagePayload = {
          model: 'hunyuan-image/v3',
          params: {
            prompt: 'A scenic mountain view',
            width: 1024,
            height: 1024,
          },
        };

        // Act
        await instance.createImage(payload);

        // Assert
        expect(mockFal.subscribe).toHaveBeenCalledWith('fal-ai/hunyuan-image/v3/text-to-image', {
          input: {
            enable_safety_checker: false,
            num_images: 1,
            prompt: 'A scenic mountain view',
            image_size: {
              width: 1024,
              height: 1024,
            },
          },
        });
      });

      it('should use edit endpoint for hunyuan-image v3 when imageUrls is provided', async () => {
        // Arrange
        const mockImageResponse = {
          requestId: 'test-request-id',
          data: {
            images: [
              {
                url: 'https://example.com/edited.jpg',
                width: 1024,
                height: 1024,
              },
            ],
          },
        };
        mockFal.subscribe.mockResolvedValue(mockImageResponse as any);

        const payload: CreateImagePayload = {
          model: 'hunyuan-image/v3',
          params: {
            prompt: 'Edit this image',
            imageUrls: ['https://example.com/input.jpg'],
            width: 1024,
            height: 1024,
          },
        };

        // Act
        await instance.createImage(payload);

        // Assert
        expect(mockFal.subscribe).toHaveBeenCalledWith('fal-ai/hunyuan-image/v3/edit', {
          input: {
            enable_safety_checker: false,
            num_images: 1,
            prompt: 'Edit this image',
            image_urls: ['https://example.com/input.jpg'],
            image_size: {
              width: 1024,
              height: 1024,
            },
          },
        });
      });
    });

    describe('Edge cases', () => {
      it('should handle empty params object', async () => {
        // Arrange
        const mockImageResponse = {
          requestId: 'test-request-id',
          data: {
            images: [
              {
                url: 'https://example.com/image.jpg',
              },
            ],
          },
        };
        mockFal.subscribe.mockResolvedValue(mockImageResponse as any);

        const payload: CreateImagePayload = {
          model: 'flux/dev',
          params: {
            prompt: 'Empty params test',
          },
        };

        // Act
        const result = await instance.createImage(payload);

        // Assert
        expect(mockFal.subscribe).toHaveBeenCalledWith('fal-ai/flux/dev', {
          input: {
            enable_safety_checker: false,
            num_images: 1,
            prompt: 'Empty params test',
          },
        });
        expect(result).toEqual({
          imageUrl: 'https://example.com/image.jpg',
        });
      });

      it('should handle model with different format', async () => {
        // Arrange
        const mockImageResponse = {
          requestId: 'test-request-id',
          data: {
            images: [
              {
                url: 'https://example.com/image.jpg',
              },
            ],
          },
        };
        mockFal.subscribe.mockResolvedValue(mockImageResponse as any);

        const payload: CreateImagePayload = {
          model: 'some-custom-model',
          params: {
            prompt: 'Test with custom model',
          },
        };

        // Act
        await instance.createImage(payload);

        // Assert
        expect(mockFal.subscribe).toHaveBeenCalledWith('fal-ai/some-custom-model', {
          input: {
            enable_safety_checker: false,
            num_images: 1,
            prompt: 'Test with custom model',
          },
        });
      });

      it('should handle response with multiple images (take first one)', async () => {
        // Arrange
        const mockImageResponse = {
          requestId: 'test-request-id',
          data: {
            images: [
              {
                url: 'https://example.com/image1.jpg',
                width: 1024,
                height: 1024,
              },
              {
                url: 'https://example.com/image2.jpg',
                width: 512,
                height: 512,
              },
            ],
          },
        };
        mockFal.subscribe.mockResolvedValue(mockImageResponse as any);

        const payload: CreateImagePayload = {
          model: 'flux/dev',
          params: {
            prompt: 'Multiple images test',
          },
        };

        // Act
        const result = await instance.createImage(payload);

        // Assert
        expect(result).toEqual({
          imageUrl: 'https://example.com/image1.jpg',
          width: 1024,
          height: 1024,
        });
      });
    });
  });
  describe('createVideo', () => {
    const submitted = () => (mockFal.queue.submit as any).mock.calls[0] as [string, { input: any }];

    beforeEach(() => {
      (mockFal.queue.submit as any).mockResolvedValue({ request_id: 'req-1' });
    });

    describe('Veo-style endpoints (unchanged)', () => {
      it('should send duration as an "Ns" enum string and keep the endpoint as-is', async () => {
        const result = await instance.createVideo({
          model: 'fal-ai/veo3.1',
          params: { aspectRatio: '16:9', duration: 8, prompt: 'a drone shot', resolution: '1080p' },
        });

        const [endpoint, { input }] = submitted();
        expect(endpoint).toBe('fal-ai/veo3.1');
        expect(input).toEqual({
          aspect_ratio: '16:9',
          duration: '8s',
          prompt: 'a drone shot',
          resolution: '1080p',
        });
        expect(result).toEqual({ inferenceId: 'fal-ai/veo3.1::req-1' });
      });
    });

    describe('MiniMax H3 Max', () => {
      it('should route to text-to-video when no start frame is attached', async () => {
        const result = await instance.createVideo({
          model: 'minimax/h3-max',
          params: {
            aspectRatio: '9:16',
            duration: 10,
            prompt: 'slow orbit around a glass sculpture',
            promptExtend: 'quality',
            resolution: '1080P',
            seed: 42,
          },
        });

        const [endpoint, { input }] = submitted();
        expect(endpoint).toBe('minimax/h3-max/text-to-video');
        expect(input).toEqual({
          aspect_ratio: '9:16',
          duration: 10,
          prompt: 'slow orbit around a glass sculpture',
          prompt_expansion_mode: 'quality',
          resolution: '1080P',
          seed: 42,
        });
        expect(result).toEqual({ inferenceId: 'minimax/h3-max/text-to-video::req-1' });
      });

      it('should route to image-to-video with a start frame and drop aspect_ratio', async () => {
        await instance.createVideo({
          model: 'minimax/h3-max',
          params: {
            aspectRatio: '16:9',
            duration: 8,
            imageUrl: 'https://cdn.example.com/product.png',
            prompt: 'product rotates 360° on a turntable',
            resolution: '768P',
          },
        });

        const [endpoint, { input }] = submitted();
        expect(endpoint).toBe('minimax/h3-max/image-to-video');
        expect(input).toEqual({
          duration: 8,
          image_url: 'https://cdn.example.com/product.png',
          prompt: 'product rotates 360° on a turntable',
          prompt_expansion_mode: 'balanced',
          resolution: '768P',
        });
        expect(input).not.toHaveProperty('aspect_ratio');
      });

      it('should forward an end frame only together with a start frame (seamless loop)', async () => {
        await instance.createVideo({
          model: 'minimax/h3-max',
          params: {
            endImageUrl: 'https://cdn.example.com/loop.png',
            imageUrl: 'https://cdn.example.com/loop.png',
            prompt: 'seamless background loop',
          },
        });
        expect(submitted()[1].input).toMatchObject({
          end_image_url: 'https://cdn.example.com/loop.png',
          image_url: 'https://cdn.example.com/loop.png',
        });

        vi.clearAllMocks();
        (mockFal.queue.submit as any).mockResolvedValue({ request_id: 'req-2' });
        await instance.createVideo({
          model: 'minimax/h3-max',
          params: { endImageUrl: 'https://cdn.example.com/end.png', prompt: 'no start frame' },
        });
        const [endpoint, { input }] = submitted();
        expect(endpoint).toBe('minimax/h3-max/text-to-video');
        expect(input).not.toHaveProperty('end_image_url');
        expect(input).not.toHaveProperty('image_url');
      });

      it('should clamp and round duration into the 5–15s range', async () => {
        await instance.createVideo({
          model: 'minimax/h3-max',
          params: { duration: 3, prompt: 'too short' },
        });
        expect(submitted()[1].input.duration).toBe(5);

        vi.clearAllMocks();
        (mockFal.queue.submit as any).mockResolvedValue({ request_id: 'req-3' });
        await instance.createVideo({
          model: 'minimax/h3-max',
          params: { duration: 22, prompt: 'too long' },
        });
        expect(submitted()[1].input.duration).toBe(15);

        vi.clearAllMocks();
        (mockFal.queue.submit as any).mockResolvedValue({ request_id: 'req-4' });
        await instance.createVideo({
          model: 'minimax/h3-max',
          params: { duration: 7.6, prompt: 'fractional' },
        });
        expect(submitted()[1].input.duration).toBe(8);
      });

      it('should fall back to balanced expansion for unknown promptExtend values', async () => {
        await instance.createVideo({
          model: 'minimax/h3-max',
          params: { prompt: 'x', promptExtend: true as any },
        });
        expect(submitted()[1].input.prompt_expansion_mode).toBe('balanced');
      });

      it('should respect an explicit task endpoint and normalise resolution casing', async () => {
        await instance.createVideo({
          model: 'minimax/h3-max/image-to-video',
          params: { imageUrl: 'https://cdn.example.com/a.png', prompt: 'x', resolution: '1080p' },
        });
        const [endpoint, { input }] = submitted();
        expect(endpoint).toBe('minimax/h3-max/image-to-video');
        expect(input.resolution).toBe('1080P');
      });

      it('should build reference-to-video input with de-duplicated reference images', async () => {
        await instance.createVideo({
          model: 'minimax/h3/reference-to-video',
          params: {
            aspectRatio: 'adaptive',
            duration: 8,
            imageUrl: 'https://cdn.example.com/pants.png',
            imageUrls: ['https://cdn.example.com/pants.png', 'https://cdn.example.com/back.png'],
            prompt: 'Image 1 is the product; the talent walks and turns',
            promptExtend: 'fast',
            resolution: '2K',
            seed: 3,
          },
        });

        const [endpoint, { input }] = submitted();
        expect(endpoint).toBe('minimax/h3/reference-to-video');
        expect(input).toEqual({
          aspect_ratio: 'adaptive',
          duration: 8,
          prompt: 'Image 1 is the product; the talent walks and turns',
          prompt_expansion_mode: 'fast',
          reference_image_urls: [
            'https://cdn.example.com/pants.png',
            'https://cdn.example.com/back.png',
          ],
          resolution: '2K',
          seed: 3,
        });
        expect(input).not.toHaveProperty('image_url');
      });

      it('should omit reference_image_urls when no references are attached', async () => {
        await instance.createVideo({
          model: 'minimax/h3/reference-to-video',
          params: { prompt: 'text only' },
        });
        const [, { input }] = submitted();
        expect(input).not.toHaveProperty('reference_image_urls');
        expect(input.prompt_expansion_mode).toBe('balanced');
      });

      it('should map a 401 to InvalidProviderAPIKey', async () => {
        const error = Object.assign(new Error('unauthorized'), { status: 401 });
        (mockFal.queue.submit as any).mockRejectedValue(error);

        await expect(
          instance.createVideo({ model: 'minimax/h3-max', params: { prompt: 'x' } }),
        ).rejects.toEqual({ error: { error }, errorType: invalidErrorType });
      });
    });
  });

  describe('handlePollVideoStatus', () => {
    it('should return pending while the queue is still working', async () => {
      (mockFal.queue.status as any).mockResolvedValue({ status: 'IN_PROGRESS' });
      const result = await instance.handlePollVideoStatus('minimax/h3-max/text-to-video::req-1');
      expect(result).toEqual({ status: 'pending' });
      expect(mockFal.queue.status).toHaveBeenCalledWith('minimax/h3-max/text-to-video', {
        logs: false,
        requestId: 'req-1',
      });
    });

    it('should return the video url once completed', async () => {
      (mockFal.queue.status as any).mockResolvedValue({ status: 'COMPLETED' });
      (mockFal.queue.result as any).mockResolvedValue({
        data: { video: { url: 'https://cdn.example.com/out.mp4' } },
      });
      const result = await instance.handlePollVideoStatus('minimax/h3-max/image-to-video::req-9');
      expect(result).toEqual({ status: 'success', videoUrl: 'https://cdn.example.com/out.mp4' });
    });

    it('should fail on a malformed inference id', async () => {
      const result = await instance.handlePollVideoStatus('no-separator');
      expect(result.status).toBe('failed');
    });
  });
});
