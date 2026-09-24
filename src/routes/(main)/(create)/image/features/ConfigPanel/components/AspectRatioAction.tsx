'use client';

import { Block, Icon } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { Proportions } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionPopover from '@/features/ChatInput/ActionBar/components/ActionPopover';
import { usePermission } from '@/hooks/usePermission';
import { useDimensionControl } from '@/store/image/slices/generationConfig/hooks';

import AspectRatioSelect from './AspectRatioSelect';

const styles = createStaticStyles(({ css }) => ({
  chip: css`
    flex-shrink: 0;
    height: 32px;
    white-space: nowrap;
  `,
}));

/**
 * Compact, always-visible toolbar shortcut for orientation: shows the current
 * ratio at a glance and opens a lightweight popover to change it, without
 * requiring a trip through the (potentially busier) Configuration popover.
 * Only the ratio picker lives here — width/height sliders and the lock
 * toggle stay in `DimensionControlGroup` for models that expose them.
 */
const AspectRatioAction = memo(() => {
  const { t } = useTranslation('image');
  const { allowed: canCreate } = usePermission('create_content');
  const { aspectRatio, setAspectRatio, options } = useDimensionControl();

  const aspectRatioOptions = useMemo(
    () => options.map((ratio) => ({ label: ratio, value: ratio })),
    [options],
  );

  return (
    <ActionPopover
      minWidth={240}
      title={t('config.aspectRatio.label')}
      trigger={'click'}
      content={
        <AspectRatioSelect
          options={aspectRatioOptions}
          style={{ width: '100%' }}
          value={aspectRatio}
          onChange={(value) => {
            if (!canCreate) return;
            setAspectRatio(value);
          }}
        />
      }
    >
      <Block
        horizontal
        align={'center'}
        className={styles.chip}
        clickable={canCreate}
        gap={6}
        paddingBlock={4}
        paddingInline={10}
        style={canCreate ? undefined : { opacity: 0.5, pointerEvents: 'none' }}
        title={t('config.aspectRatio.label')}
        variant={'filled'}
      >
        <Icon color={cssVar.colorTextDescription} icon={Proportions} size={14} />
        <Text fontSize={12}>{aspectRatio}</Text>
      </Block>
    </ActionPopover>
  );
});

AspectRatioAction.displayName = 'AspectRatioAction';

export default AspectRatioAction;
