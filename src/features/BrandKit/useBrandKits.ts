import type { BrandKit } from '@lobechat/types';
import { useCallback, useMemo } from 'react';

import { useUserStore } from '@/store/user';
import { settingsSelectors } from '@/store/user/slices/settings/selectors';

import { findBrandKit, sanitizeBrandKit } from './brandKit';

/**
 * Brand kits live in the user's `image` settings column, so they sync across
 * devices without a migration. Each write sends the whole list: the settings
 * merge replaces arrays wholesale (see packages/utils merge), which is what
 * makes delete work.
 */
export const useBrandKits = () => {
  const imageSettings = useUserStore(settingsSelectors.currentImageSettings);
  const setSettings = useUserStore((s) => s.setSettings);

  const kits = useMemo(() => imageSettings.brandKits ?? [], [imageSettings.brandKits]);
  const activeKitId = imageSettings.activeBrandKitId ?? '';
  const activeKit = useMemo(() => findBrandKit(kits, activeKitId), [kits, activeKitId]);

  const setActiveKitId = useCallback(
    async (id: string) => {
      await setSettings({ image: { activeBrandKitId: id } });
    },
    [setSettings],
  );

  const saveKit = useCallback(
    async (kit: BrandKit) => {
      const clean = sanitizeBrandKit(kit);
      const exists = kits.some((k) => k.id === clean.id);
      const next = exists ? kits.map((k) => (k.id === clean.id ? clean : k)) : [...kits, clean];
      await setSettings({ image: { brandKits: next } });
      return clean;
    },
    [kits, setSettings],
  );

  const deleteKit = useCallback(
    async (id: string) => {
      const next = kits.filter((k) => k.id !== id);
      await setSettings({
        image: { activeBrandKitId: activeKitId === id ? '' : activeKitId, brandKits: next },
      });
    },
    [activeKitId, kits, setSettings],
  );

  return { activeKit, activeKitId, deleteKit, kits, saveKit, setActiveKitId };
};
