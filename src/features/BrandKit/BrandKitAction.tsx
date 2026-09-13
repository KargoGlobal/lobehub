'use client';

import { Flexbox } from '@lobehub/ui';
import { Button, Select, Text, toast } from '@lobehub/ui/base-ui';
import { Palette } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Action from '@/features/ChatInput/ActionBar/components/Action';
import { usePermission } from '@/hooks/usePermission';

import { applyBrandPreamble, type BrandPreambleTarget } from './brandKit';
import BrandKitEditor from './BrandKitEditor';
import { useBrandKits } from './useBrandKits';

interface BrandKitActionProps {
  onPromptChange: (next: string) => void;
  prompt: string;
  target: BrandPreambleTarget;
}

/**
 * Toolbar entry shared by the image and video prompt bars: pick the active
 * kit, fold it into the prompt, or open the editor. Applying is explicit (a
 * button, not silent injection) so the user always sees what the model gets.
 */
const BrandKitAction = memo<BrandKitActionProps>(({ prompt, onPromptChange, target }) => {
  const { t } = useTranslation('image');
  const { allowed: canCreate } = usePermission('create_content');
  const { kits, activeKit, activeKitId, setActiveKitId } = useBrandKits();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const options = useMemo(
    () => [
      { label: t('brandKit.none'), value: '' },
      ...kits.map((k) => ({ label: k.name || t('brandKit.untitled'), value: k.id })),
    ],
    [kits, t],
  );

  const handleApply = useCallback(() => {
    if (!canCreate || !activeKit) return;
    onPromptChange(applyBrandPreamble(prompt, activeKit, target));
    toast.success({ description: t('brandKit.applied', { name: activeKit.name }), duration: 2000 });
    setOpen(false);
  }, [activeKit, canCreate, onPromptChange, prompt, t, target]);

  const title = activeKit ? `${t('brandKit.title')} · ${activeKit.name}` : t('brandKit.title');

  return (
    <>
      <Action
        icon={Palette}
        open={open}
        title={title}
        trigger={'click'}
        popover={{
          content: (
            <Flexbox gap={10} style={{ minWidth: 240 }}>
              <Text type={'secondary'}>{t('brandKit.pickHint')}</Text>
              <Select
                data-testid={'brandkit-select'}
                options={options}
                value={activeKitId}
                onChange={(v) => setActiveKitId(String(v ?? ''))}
              />
              <Flexbox horizontal gap={8} justify={'flex-end'}>
                <Button
                  size={'small'}
                  onClick={() => {
                    setOpen(false);
                    setEditing(true);
                  }}
                >
                  {t('brandKit.manage')}
                </Button>
                <Button
                  data-testid={'brandkit-apply'}
                  disabled={!activeKit || !canCreate}
                  size={'small'}
                  type={'primary'}
                  onClick={handleApply}
                >
                  {t('brandKit.apply')}
                </Button>
              </Flexbox>
            </Flexbox>
          ),
          title: t('brandKit.title'),
        }}
        onOpenChange={setOpen}
      />
      {editing && <BrandKitEditor open={editing} onClose={() => setEditing(false)} />}
    </>
  );
});

BrandKitAction.displayName = 'BrandKitAction';

export default BrandKitAction;
