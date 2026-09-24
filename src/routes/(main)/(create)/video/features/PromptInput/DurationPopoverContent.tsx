'use client';

import { Flexbox } from '@lobehub/ui';
import { Button, SliderWithInput, Tabs, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { usePermission } from '@/hooks/usePermission';
import { aiProviderSelectors, useAiInfraStore } from '@/store/aiInfra';
import { useVideoStore } from '@/store/video';
import {
  useVideoGenerationConfigParam,
  useVideoModelDisplayName,
} from '@/store/video/slices/generationConfig/hooks';

import { describeDurationSupport, getLongerCutHintRange } from './durationSupport';

// MiniMax H3 Max (`minimax/h3-max` in packages/model-bank/src/aiModels/fal.ts) is the
// only wired model whose duration reaches the 15s platform ceiling today, so it's the
// target for the "need longer?" hint on enum (Veo-style) models.
const LONGER_DURATION_MODEL_ID = 'minimax/h3-max';

const styles = createStaticStyles(({ css }) => ({
  caption: css`
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  header: css`
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  ticks: css`
    flex-wrap: wrap;
  `,
}));

/** Where to find the longer-duration model in the enabled list, if it's wired up. */
function useLongerDurationModel() {
  const enabledVideoModelList = useAiInfraStore(aiProviderSelectors.enabledVideoModelList);

  return useMemo(() => {
    for (const providerGroup of enabledVideoModelList) {
      const model = providerGroup.children.find((m) => m.id === LONGER_DURATION_MODEL_ID) as
        { displayName?: string; id: string; parameters?: { duration?: unknown } } | undefined;
      if (!model) continue;

      const durationSchema = describeDurationSupport(
        (model.parameters?.duration ?? { default: 15, max: 15, min: 5 }) as {
          default: number;
          max?: number;
          min?: number;
        },
      );

      return {
        displayName: model.displayName ?? LONGER_DURATION_MODEL_ID,
        max: durationSchema.max,
        min: durationSchema.min,
        providerId: providerGroup.id,
      };
    }
    return undefined;
  }, [enabledVideoModelList]);
}

const DurationPopoverContent = memo(() => {
  const { t } = useTranslation('video');
  const { allowed: canCreate } = usePermission('create_content');
  const { value, setValue, min, max, step, enumValues } = useVideoGenerationConfigParam('duration');
  const modelDisplayName = useVideoModelDisplayName();
  const setModelAndProviderOnSelect = useVideoStore((s) => s.setModelAndProviderOnSelect);
  const longerDurationModel = useLongerDurationModel();

  const support = useMemo(
    () => describeDurationSupport({ default: value ?? min ?? 0, enum: enumValues, max, min }),
    [value, min, max, enumValues],
  );

  const enumOptions = useMemo(
    () =>
      enumValues && enumValues.length > 0
        ? enumValues.map((v) => ({ disabled: !canCreate, key: String(v), label: `${v}s` }))
        : [],
    [enumValues, canCreate],
  );

  const showLongerCutHint =
    support.kind === 'enum' && support.needsLongerCutHint && Boolean(longerDurationModel);

  const hintRange = useMemo(() => {
    if (!showLongerCutHint || !longerDurationModel) return undefined;
    return getLongerCutHintRange(support.max, longerDurationModel.min, longerDurationModel.max);
  }, [showLongerCutHint, longerDurationModel, support.max]);

  return (
    <Flexbox gap={10} width={'100%'}>
      <Text className={styles.header}>
        {t('config.duration.supportedRange', {
          max: support.max,
          min: support.min,
          model: modelDisplayName,
        })}
      </Text>

      {enumOptions.length > 0 ? (
        <Tabs
          activeKey={String(value ?? min)}
          items={enumOptions}
          style={{ width: '100%' }}
          styles={{
            list: { display: 'flex', width: '100%' },
            tab: { flex: 1 },
          }}
          onChange={(key) => {
            if (!canCreate) return;
            setValue(Number(key) as any);
          }}
        />
      ) : (
        <Flexbox gap={6}>
          <SliderWithInput
            disabled={!canCreate}
            max={max}
            min={min}
            step={step ?? 1}
            value={value ?? min}
            onChange={(v) => {
              if (!canCreate) return;
              setValue(v as any);
            }}
          />
          {support.presetTicks && support.presetTicks.length > 0 && (
            <Flexbox horizontal className={styles.ticks} gap={6}>
              {support.presetTicks.map((tick) => (
                <Button
                  disabled={!canCreate}
                  key={tick}
                  size={'small'}
                  type={value === tick ? 'primary' : 'default'}
                  onClick={() => {
                    if (!canCreate) return;
                    setValue(tick as any);
                  }}
                >
                  {tick}s
                </Button>
              ))}
            </Flexbox>
          )}
        </Flexbox>
      )}

      {showLongerCutHint && longerDurationModel && hintRange && (
        <Flexbox horizontal align={'center'} gap={8} justify={'space-between'}>
          <Text className={styles.caption}>
            {t('config.duration.longerCutHint', {
              max: hintRange.upper,
              min: hintRange.lower,
              model: longerDurationModel.displayName,
            })}
          </Text>
          <Button
            disabled={!canCreate}
            size={'small'}
            onClick={() => {
              if (!canCreate) return;
              // Prompt and any reference frame survive the switch via
              // preserveVideoInputParams' holding-slot preservation.
              setModelAndProviderOnSelect(LONGER_DURATION_MODEL_ID, longerDurationModel.providerId);
            }}
          >
            {t('config.duration.longerCutSwitch')}
          </Button>
        </Flexbox>
      )}

      <Text className={styles.caption}>{t('config.duration.ceiling')}</Text>
    </Flexbox>
  );
});

DurationPopoverContent.displayName = 'DurationPopoverContent';

export default DurationPopoverContent;
