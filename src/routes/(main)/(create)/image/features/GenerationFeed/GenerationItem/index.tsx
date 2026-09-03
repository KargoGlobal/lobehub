'use client';

import { toast } from '@lobehub/ui/base-ui';
import dayjs from 'dayjs';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useDownloadImage } from '@/hooks/useDownloadImage';
import { useImageStore } from '@/store/image';
import { imageGenerationConfigSelectors } from '@/store/image/selectors';
import { AsyncTaskStatus } from '@/types/asyncTask';
import { inferFileExtensionFromImageUrl } from '@/utils/url';

import { ErrorState } from './ErrorState';
import { LoadingState } from './LoadingState';
import { SuccessState } from './SuccessState';
import { type GenerationItemProps } from './types';
import { getAspectRatio } from './utils';

const isSupportedParamSelector = imageGenerationConfigSelectors.isSupportedParam;

/**
 * Offering "remove background" on something that is already a cut-out is noise,
 * so the action hides itself on this model's own output.
 */
const BACKGROUND_REMOVAL_MODEL_ID = 'fal-ai/birefnet/v2';

export const GenerationItem = memo<GenerationItemProps>(
  ({ generationBatch, generation, prompt }) => {
    const { t } = useTranslation('image');
    const useCheckGenerationStatus = useImageStore((s) => s.useCheckGenerationStatus);
    const deleteGeneration = useImageStore((s) => s.removeGeneration);
    const removeBackground = useImageStore((s) => s.removeBackground);
    const reuseSeed = useImageStore((s) => s.reuseSeed);
    const activeTopicId = useImageStore((s) => s.activeGenerationTopicId);
    const isSupportSeed = useImageStore(isSupportedParamSelector('seed'));
    const { downloadImage } = useDownloadImage();

    const isFinalized =
      generation.task.status === AsyncTaskStatus.Success ||
      generation.task.status === AsyncTaskStatus.Error;

    const shouldPoll = !isFinalized;
    useCheckGenerationStatus(generation.id, generation.task.id, activeTopicId!, shouldPoll);

    const aspectRatio = getAspectRatio(generation, generationBatch);

    // Event handler functions
    const handleDeleteGeneration = useCallback(async () => {
      try {
        await deleteGeneration(generation.id);
      } catch (error) {
        console.error('Failed to delete generation:', error);
      }
    }, [deleteGeneration, generation.id]);

    const handleDownloadImage = useCallback(async () => {
      if (!generation.asset?.url) return;

      // Generate filename with prompt and timestamp
      const timestamp = dayjs(generation.createdAt).format('YYYY-MM-DD_HH-mm-ss');
      const baseName = prompt.slice(0, 30).trim();
      const sanitizedBaseName = baseName.replaceAll(/["%*/:<>?\\|]/g, '').replaceAll(/\s+/g, '_');
      const safePrompt = sanitizedBaseName || 'Untitled';

      const fileExtension = inferFileExtensionFromImageUrl(generation.asset.url);
      const fileName = `${safePrompt}_${timestamp}.${fileExtension}`;

      await downloadImage(generation.asset.url, fileName);
    }, [downloadImage, generation.asset?.url, generation.createdAt, prompt]);

    const handleRemoveBackground = useCallback(async () => {
      if (!generation.asset?.url) return;

      try {
        await removeBackground(generation.asset.url);
      } catch (error) {
        console.error('Failed to remove background:', error);
        toast.error(
          error instanceof Error ? error.message : t('generation.actions.removeBackgroundFailed'),
        );
      }
    }, [removeBackground, generation.asset?.url, t]);

    const handleCopySeed = useCallback(async () => {
      if (!generation.seed) return;

      // If current model supports seed parameter, apply it directly to configuration
      if (isSupportSeed) {
        try {
          reuseSeed(generation.seed);
          toast.success(t('generation.actions.seedApplied'));
        } catch (error) {
          console.error('Failed to apply seed:', error);
          toast.error(t('generation.actions.seedApplyFailed'));
        }
      } else {
        // If current model doesn't support seed parameter, copy to clipboard
        try {
          await navigator.clipboard.writeText(generation.seed.toString());
          toast.success(t('generation.actions.seedCopied'));
        } catch (error) {
          console.error('Failed to copy seed:', error);
          toast.error(t('generation.actions.seedCopyFailed'));
        }
      }
    }, [generation.seed, isSupportSeed, t, reuseSeed]);

    const handleCopyError = useCallback(async () => {
      if (!generation.task.error) return;

      const errorMessage =
        typeof generation.task.error.body === 'string'
          ? generation.task.error.body
          : generation.task.error.body?.detail || generation.task.error.name || 'Unknown error';

      try {
        await navigator.clipboard.writeText(errorMessage);
        toast.success(t('generation.actions.errorCopied'));
      } catch (error) {
        console.error('Failed to copy error message:', error);
        toast.error(t('generation.actions.errorCopyFailed'));
      }
    }, [generation.task.error, t]);

    // Render corresponding component based on status
    if (generation.task.status === AsyncTaskStatus.Success && generation.asset?.url) {
      const seedTooltip = isSupportSeed
        ? t('generation.actions.applySeed')
        : t('generation.actions.copySeed');

      return (
        <SuccessState
          aspectRatio={aspectRatio}
          generation={generation}
          generationBatch={generationBatch}
          prompt={prompt}
          seedTooltip={seedTooltip}
          showRemoveBackground={generationBatch.model !== BACKGROUND_REMOVAL_MODEL_ID}
          onCopySeed={handleCopySeed}
          onDelete={handleDeleteGeneration}
          onDownload={handleDownloadImage}
          onRemoveBackground={handleRemoveBackground}
        />
      );
    }

    if (generation.task.status === AsyncTaskStatus.Error) {
      return (
        <ErrorState
          aspectRatio={aspectRatio}
          generation={generation}
          generationBatch={generationBatch}
          onCopyError={handleCopyError}
          onDelete={handleDeleteGeneration}
        />
      );
    }

    // Loading state (Processing or Pending)
    return (
      <LoadingState
        aspectRatio={aspectRatio}
        generation={generation}
        generationBatch={generationBatch}
        onDelete={handleDeleteGeneration}
      />
    );
  },
);

GenerationItem.displayName = 'GenerationItem';
