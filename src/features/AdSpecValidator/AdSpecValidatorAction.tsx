'use client';

import { Flexbox, Popover } from '@lobehub/ui';
import { ActionIcon, Select, Tag, Text } from '@lobehub/ui/base-ui';
import { Ruler } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  AD_FORMATS,
  type AdFormat,
  matchBestFormats,
  type SpecStatus,
  validateAsset,
} from './specs';

export interface AdSpecValidatorActionProps {
  /** Video duration in seconds. Omit for images. */
  duration?: number;
  height?: number;
  width?: number;
}

const STATUS_COLOR: Record<SpecStatus, string> = {
  fail: 'error',
  pass: 'success',
  warn: 'warning',
};

const AUTO_VALUE = 'auto';

/**
 * Self-contained checklist icon for a single generated image/video item: the
 * caller passes only the asset's own actual dimensions (and duration, for
 * video) — this component has no dependency on `Generation`/`GenerationBatch`
 * or any other feature's internals, so it drops into both the image and
 * video generation feeds unchanged.
 */
export const AdSpecValidatorAction = memo<AdSpecValidatorActionProps>(
  ({ width, height, duration }) => {
    const { t } = useTranslation('image');
    const [open, setOpen] = useState(false);
    const [targetId, setTargetId] = useState<string>(AUTO_VALUE);

    const asset = useMemo(() => ({ duration, height, width }), [duration, height, width]);

    const matches = useMemo(() => matchBestFormats(asset), [asset]);

    const selectedFormat: AdFormat | undefined = useMemo(
      () => (targetId === AUTO_VALUE ? undefined : AD_FORMATS.find((f) => f.id === targetId)),
      [targetId],
    );

    const selectedResult = useMemo(
      () => (selectedFormat ? validateAsset(asset, selectedFormat) : undefined),
      [asset, selectedFormat],
    );

    const options = useMemo(
      () => [
        { label: t('adSpecValidator.autoOption'), value: AUTO_VALUE },
        ...AD_FORMATS.map((format) => ({
          label: `[${t(`adSpecValidator.category.${format.category}` as any)}] ${format.label}`,
          value: format.id,
        })),
      ],
      [t],
    );

    const assetSummary =
      duration === undefined
        ? t('adSpecValidator.assetSummary', { height, width })
        : t('adSpecValidator.assetSummaryWithDuration', { duration, height, width });

    return (
      <Popover
        open={open}
        placement={'left'}
        styles={{ content: { maxHeight: '70vh', overflowY: 'auto' } }}
        trigger={'click'}
        content={
          <Flexbox gap={12} style={{ width: 300 }}>
            <Text strong>{t('adSpecValidator.title')}</Text>
            <Text type={'secondary'}>{assetSummary}</Text>
            <Flexbox gap={6}>
              <Text type={'secondary'}>{t('adSpecValidator.targetLabel')}</Text>
              <Select
                options={options}
                value={targetId}
                onChange={(value) => setTargetId(value as string)}
              />
            </Flexbox>
            {selectedFormat && selectedResult ? (
              <Flexbox gap={6}>
                <Flexbox horizontal align={'center'} gap={6}>
                  <Tag color={STATUS_COLOR[selectedResult.status]}>
                    {t(`adSpecValidator.status.${selectedResult.status}`)}
                  </Tag>
                  <Text ellipsis title={selectedFormat.label}>
                    {selectedFormat.label}
                  </Text>
                </Flexbox>
                {selectedResult.messages.map((message, index) => (
                  <Text fontSize={12} key={index} type={'secondary'}>
                    {message}
                  </Text>
                ))}
                <Text fontSize={11} type={'secondary'}>
                  {selectedFormat.notes}
                </Text>
              </Flexbox>
            ) : matches.length > 0 ? (
              <Flexbox gap={6}>
                {matches.map(({ format, result }) => (
                  <Flexbox horizontal align={'center'} gap={6} key={format.id}>
                    <Tag color={STATUS_COLOR[result.status]}>
                      {t(`adSpecValidator.status.${result.status}`)}
                    </Tag>
                    <Text ellipsis title={format.label}>
                      {format.label}
                    </Text>
                  </Flexbox>
                ))}
              </Flexbox>
            ) : (
              <Text type={'secondary'}>{t('adSpecValidator.noMatches')}</Text>
            )}
          </Flexbox>
        }
        onOpenChange={setOpen}
      >
        <ActionIcon icon={Ruler} title={t('adSpecValidator.title')} />
      </Popover>
    );
  },
);

AdSpecValidatorAction.displayName = 'AdSpecValidatorAction';

export default AdSpecValidatorAction;
