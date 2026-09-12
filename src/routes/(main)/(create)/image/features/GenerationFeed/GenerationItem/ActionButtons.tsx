'use client';

import { type ActionIconGroupProps, Flexbox } from '@lobehub/ui';
import { ActionIconGroup } from '@lobehub/ui';
import { type ActionIconProps } from '@lobehub/ui/base-ui';
import { Dices, Download, Eraser, Sparkles, Trash2 } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import ImageEditToolButton from './ImageEditToolButton';
import { styles } from './styles';
import { type ActionButtonsProps } from './types';

const actionIconProps: Partial<Omit<ActionIconProps, 'size' | 'ref' | 'icon'>> = {
  tooltipProps: { placement: 'left' },
};
// Action buttons component
export const ActionButtons = memo<ActionButtonsProps>(
  ({
    onDelete,
    onDownload,
    onCopySeed,
    onRemoveBackground,
    onUpscale,
    showDownload = false,
    showCopySeed = false,
    seedTooltip,
    sourceUrl,
  }) => {
    const { t } = useTranslation('image');

    return (
      <Flexbox className={styles.generationActionButton} gap={4}>
        {sourceUrl && <ImageEditToolButton sourceUrl={sourceUrl} />}
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
                Boolean(showCopySeed && onCopySeed) && {
                  icon: Dices,
                  key: 'copySeed',
                  label: seedTooltip,
                  onClick: onCopySeed,
                },
                {
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
              onUpscale,
              showCopySeed,
              onCopySeed,
              seedTooltip,
              onDelete,
            ],
          )}
        />
      </Flexbox>
    );
  },
);

ActionButtons.displayName = 'ActionButtons';
