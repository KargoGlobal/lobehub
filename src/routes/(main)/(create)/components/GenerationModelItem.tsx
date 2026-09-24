'use client';

import { BRANDING_PROVIDER } from '@lobechat/business-const';
import { CREDITS_PER_DOLLAR } from '@lobechat/const/currency';
import { ModelIcon } from '@lobehub/icons';
import { Flexbox, Icon, Popover, Tooltip } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cx } from 'antd-style';
import { Info } from 'lucide-react';
import type { AiModelForSelect } from 'model-bank';
import numeral from 'numeral';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import NewModelBadge from '@/components/ModelSelect/NewModelBadge';
import { useIsDark } from '@/hooks/useIsDark';
import { useServerConfigStore } from '@/store/serverConfig';
import { serverConfigSelectors } from '@/store/serverConfig/selectors';

import { formatEstimatedCostLabel, isMegapixelPricedUnit } from './generationModelPricing';

const POPOVER_MAX_WIDTH = 320;

const styles = createStaticStyles(({ css, cssVar }) => ({
  descriptionText: css`
    color: ${cssVar.colorTextSecondary};
  `,
  descriptionText_dark: css`
    color: ${cssVar.colorText};
  `,
  popover: css`
    .ant-popover-inner {
      background: ${cssVar.colorBgElevated};
    }
  `,
  popover_dark: css`
    .ant-popover-inner {
      background: ${cssVar.colorBgSpotlight};
    }
  `,
  priceText: css`
    font-weight: 500;
    color: ${cssVar.colorTextTertiary};
    word-break: keep-all;
    white-space: nowrap;
  `,
  priceText_dark: css`
    font-weight: 500;
    color: ${cssVar.colorTextLightSolid};
  `,
}));

export interface GenerationModelItemProps extends AiModelForSelect {
  /**
   * Which USD price fields to use: image uses approximatePricePerImage / pricePerImage; video uses approximatePricePerVideo / pricePerVideo.
   * @default 'image'
   */
  priceKind?: 'image' | 'video';
  /**
   * Provider ID for determining price display format (when showPrice is true)
   */
  providerId?: string;
  /**
   * Whether to show new model badge
   * @default true
   */
  showBadge?: boolean;
  /**
   * Whether to show popover on hover
   * @default true
   */
  showPopover?: boolean;
  /**
   * Whether to show price in popover (e.g. true for image, false for video)
   * @default false
   */
  showPrice?: boolean;
}

const GenerationModelItem = memo<GenerationModelItemProps>(
  ({
    approximatePricePerImage,
    approximatePricePerVideo,
    description,
    pricePerImage,
    pricePerVideo,
    pricing,
    providerId,
    showPopover = true,
    showBadge = true,
    showPrice = false,
    priceKind = 'image',
    ...model
  }) => {
    const isDarkMode = useIsDark();
    const { t } = useTranslation('components');
    const enableBusinessFeatures = useServerConfigStore(
      serverConfigSelectors.enableBusinessFeatures,
    );

    const priceLabel = useMemo(() => {
      if (!showPrice) return undefined;

      const isVideo = priceKind === 'video';
      const exactUsd = isVideo ? pricePerVideo : pricePerImage;
      const approxUsd = isVideo ? approximatePricePerVideo : approximatePricePerImage;

      if (enableBusinessFeatures && providerId === BRANDING_PROVIDER) {
        if (typeof exactUsd === 'number') {
          const credits = exactUsd * CREDITS_PER_DOLLAR;
          return t(
            isVideo
              ? 'GenerationModelItem.creditsPerVideoExact'
              : 'GenerationModelItem.creditsPerImageExact',
            { amount: numeral(credits).format('0,0') },
          );
        }
        if (typeof approxUsd === 'number') {
          const credits = approxUsd * CREDITS_PER_DOLLAR;
          return t(
            isVideo
              ? 'GenerationModelItem.creditsPerVideoApproximate'
              : 'GenerationModelItem.creditsPerImageApproximate',
            { amount: numeral(credits).format('0,0') },
          );
        }
        return undefined;
      }

      return formatEstimatedCostLabel({
        approximatePricePerImage,
        approximatePricePerVideo,
        isMegapixelPriced: isMegapixelPricedUnit(pricing),
        priceKind,
        pricePerImage,
        pricePerVideo,
        // formatEstimatedCostLabel builds keys generically (image vs video, flat
        // vs megapixel), so it takes a loosely-typed translator rather than the
        // narrow per-namespace literal-key union `useTranslation` returns.
        t: t as (key: string, options?: Record<string, unknown>) => string,
      });
    }, [
      showPrice,
      approximatePricePerImage,
      approximatePricePerVideo,
      enableBusinessFeatures,
      pricePerImage,
      pricePerVideo,
      pricing,
      priceKind,
      providerId,
      t,
    ]);

    const priceTooltip = t('GenerationModelItem.estimatedCostTooltip', {
      defaultValue:
        "The provider's list price for this generated output, charged to the team account — not a bill to you.",
    });

    const popoverContent = useMemo(() => {
      if (!description && !priceLabel) return null;

      return (
        <Flexbox gap={8} style={{ maxWidth: POPOVER_MAX_WIDTH }}>
          {description && (
            <Text className={cx(styles.descriptionText, isDarkMode && styles.descriptionText_dark)}>
              {description}
            </Text>
          )}
          {priceLabel && (
            <Flexbox horizontal align={'center'} gap={4}>
              <Text className={cx(styles.priceText, isDarkMode && styles.priceText_dark)}>
                {priceLabel}
              </Text>
              <Tooltip title={priceTooltip}>
                <span aria-label={priceTooltip} role={'img'} style={{ display: 'inline-flex' }}>
                  <Icon icon={Info} size={12} />
                </span>
              </Tooltip>
            </Flexbox>
          )}
        </Flexbox>
      );
    }, [description, priceLabel, isDarkMode, priceTooltip]);

    const content = (
      <Flexbox horizontal align={'center'} gap={8} style={{ overflow: 'hidden' }}>
        <ModelIcon model={model.id} size={20} />
        <Text ellipsis title={model.displayName || model.id}>
          {model.displayName || model.id}
        </Text>
        {showBadge && <NewModelBadge releasedAt={model.releasedAt} />}
      </Flexbox>
    );

    if (!showPopover || !popoverContent) return content;

    return (
      <Popover
        classNames={{ root: cx(styles.popover, isDarkMode && styles.popover_dark) }}
        content={popoverContent}
        placement="rightTop"
      >
        {content}
      </Popover>
    );
  },
);

GenerationModelItem.displayName = 'GenerationModelItem';

export default GenerationModelItem;
