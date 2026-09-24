'use client';

import { type ActionIconGroupProps, Flexbox } from '@lobehub/ui';
import { ActionIconGroup } from '@lobehub/ui';
import { type ActionIconProps } from '@lobehub/ui/base-ui';
import { Ban, Dices, Download, Eraser, Sparkles, SquarePen, Trash2, Video } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { AdSpecValidatorAction } from '@/features/AdSpecValidator';

import ImageEditToolButton from './ImageEditToolButton';
import MaskEditToolButton from './MaskEditor/MaskEditToolButton';
import { styles } from './styles';
import { type ActionButtonsProps } from './types';

const actionIconProps: Partial<Omit<ActionIconProps, 'size' | 'ref' | 'icon'>> = {
  tooltipProps: { placement: 'left' },
};
// Action buttons component
export const ActionButtons = memo<ActionButtonsProps>(
  ({
    onCancel,
    onDelete,
    onDownload,
    onCopySeed,
    onRefine,
    onRemoveBackground,
    onSendToVideo,
    onUpscale,
    showDownload = false,
    showCopySeed = false,
    seedTooltip,
    sourceUrl,
    width,
    height,
  }) => {
    const { t } = useTranslation('image');

    return (
      <Flexbox className={styles.generationActionButton} gap={4}>
        {sourceUrl && <ImageEditToolButton sourceUrl={sourceUrl} />}
        {sourceUrl && <MaskEditToolButton sourceUrl={sourceUrl} />}
        {(width || height) && <AdSpecValidatorAction height={height} width={width} />}
        <ActionIconGroup
          actionIconProps={actionIconProps}
          horizontal={false}
          variant="outlined"
          items={useMemo(
            () =>
              [
                Boolean(showDownload && onDownload) && {
                  icon: Download,
                  key: 'download',
                  label: t('generation.actions.download'),
                  onClick: onDownload,
                },
                Boolean(onRemoveBackground) && {
                  icon: Eraser,
                  key: 'removeBackground',
                  label: t('generation.actions.removeBackground'),
                  onClick: onRemoveBackground,
                },
                Boolean(onUpscale) && {
                  icon: Sparkles,
                  key: 'upscale',
                  label: t('generation.actions.upscale'),
                  onClick: onUpscale,
                },
                Boolean(onRefine) && {
                  icon: SquarePen,
                  key: 'refine',
                  label: t('generation.actions.refine'),
                  onClick: onRefine,
                },
                Boolean(onSendToVideo) && {
                  icon: Video,
                  key: 'sendToVideo',
                  label: t('generation.actions.sendToVideo'),
                  onClick: onSendToVideo,
                },
                Boolean(showCopySeed && onCopySeed) && {
                  icon: Dices,
                  key: 'copySeed',
                  label: seedTooltip,
                  onClick: onCopySeed,
                },
                Boolean(onCancel) && {
                  icon: Ban,
                  key: 'cancel',
                  label: t('generation.actions.cancel'),
                  onClick: onCancel,
                },
                Boolean(onDelete) && {
                  danger: true,
                  icon: Trash2,
                  key: 'delete',
                  label: t('generation.actions.delete'),
                  onClick: onDelete,
                },
              ].filter(Boolean) as ActionIconGroupProps['items'],
            [
              showDownload,
              onDownload,
              onRemoveBackground,
              onRefine,
              onSendToVideo,
              onUpscale,
              showCopySeed,
              onCopySeed,
              seedTooltip,
              onCancel,
              onDelete,
              t,
            ],
          )}
        />
      </Flexbox>
    );
  },
);

ActionButtons.displayName = 'ActionButtons';
