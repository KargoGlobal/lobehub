'use client';

import type { LucideIcon } from 'lucide-react';
import { Clapperboard, Film, ListVideo, Mic, Sparkles, Wand2, Wrench } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Action from '@/features/ChatInput/ActionBar/components/Action';
import type { ActionDropdownMenuItems } from '@/features/ChatInput/ActionBar/components/ActionDropdown';
import AdVoiceAction from '@/routes/(main)/(create)/video/features/AdVoice';
import AutoAnimateAction, {
  useAutoAnimateAvailability,
} from '@/routes/(main)/(create)/video/features/AutoAnimate';
import CameraDirectorAction, {
  useCameraDirectorAvailability,
} from '@/routes/(main)/(create)/video/features/CameraDirector';
import FinalCutAction from '@/routes/(main)/(create)/video/features/FinalCut';
import StoryboardAction, {
  useStoryboardAvailability,
} from '@/routes/(main)/(create)/video/features/Storyboard';
import VideoRestyleAction from '@/routes/(main)/(create)/video/features/VideoRestyle';

type ToolId =
  'adVoice' | 'autoAnimate' | 'cameraDirector' | 'finalCut' | 'storyboard' | 'videoRestyle';

interface ToolSpec {
  available: boolean;
  descKey: string;
  icon: LucideIcon;
  id: ToolId;
  reasonKey?: string;
  titleKey: string;
}

/**
 * Single "Tools" entry point for the six video creation tools (Auto Animate,
 * Camera Director, Storyboard, Ad Voice, Video Restyle, Final Cut), replacing
 * six bare icon buttons in the toolbar. Each tool stays a self-contained
 * feature component — this menu only supplies the trigger; opening an item
 * mounts that tool's own existing modal unchanged.
 *
 * A tool that can't apply to the currently selected model shows disabled with
 * the reason (discoverability), rather than being hidden (Tiffany's "too many
 * icons" feedback) or silently enabled (which would let the user configure a
 * request that can't actually run).
 */
const ToolsMenu = memo(() => {
  const { t } = useTranslation('video');
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);

  const autoAnimateAvailable = useAutoAnimateAvailability();
  const cameraDirectorAvailable = useCameraDirectorAvailability();
  const storyboardAvailable = useStoryboardAvailability();

  const tools: ToolSpec[] = useMemo(
    () => [
      {
        available: autoAnimateAvailable,
        descKey: 'autoAnimate.toolDescription',
        icon: Sparkles,
        id: 'autoAnimate',
        reasonKey: 'tools.unavailable.h3Max',
        titleKey: 'autoAnimate.title',
      },
      {
        available: cameraDirectorAvailable,
        descKey: 'cameraDirector.toolDescription',
        icon: Clapperboard,
        id: 'cameraDirector',
        reasonKey: 'tools.unavailable.h3Family',
        titleKey: 'cameraDirector.title',
      },
      {
        available: storyboardAvailable,
        descKey: 'storyboard.toolDescription',
        icon: ListVideo,
        id: 'storyboard',
        reasonKey: 'tools.unavailable.h3Max',
        titleKey: 'storyboard.title',
      },
      {
        available: true,
        descKey: 'adVoice.toolDescription',
        icon: Mic,
        id: 'adVoice',
        titleKey: 'adVoice.title',
      },
      {
        available: true,
        descKey: 'videoRestyle.toolDescription',
        icon: Wand2,
        id: 'videoRestyle',
        titleKey: 'videoRestyle.title',
      },
      {
        available: true,
        descKey: 'finalCut.toolDescription',
        icon: Film,
        id: 'finalCut',
        titleKey: 'finalCut.title',
      },
    ],
    [autoAnimateAvailable, cameraDirectorAvailable, storyboardAvailable],
  );

  const items: ActionDropdownMenuItems = useMemo(
    () =>
      tools.map((tool) => ({
        // Keys are picked dynamically per tool/availability, so they can't be
        // narrowed to the namespace's literal key union `useTranslation` expects.
        desc: tool.available ? t(tool.descKey as any) : t((tool.reasonKey ?? tool.descKey) as any),
        disabled: !tool.available,
        icon: tool.icon,
        key: tool.id,
        label: t(tool.titleKey as any),
        onClick: () => {
          if (!tool.available) return;
          setActiveTool(tool.id);
        },
      })),
    [tools, t],
  );

  const closeActiveTool = (open: boolean) => {
    if (!open) setActiveTool(null);
  };

  return (
    <>
      <Action
        dropdown={{ menu: { items }, minWidth: 260 }}
        icon={Wrench}
        title={t('tools.title')}
        trigger={'click'}
      />
      <AutoAnimateAction
        open={activeTool === 'autoAnimate'}
        renderTrigger={false}
        onOpenChange={closeActiveTool}
      />
      <CameraDirectorAction
        open={activeTool === 'cameraDirector'}
        renderTrigger={false}
        onOpenChange={closeActiveTool}
      />
      <StoryboardAction
        open={activeTool === 'storyboard'}
        renderTrigger={false}
        onOpenChange={closeActiveTool}
      />
      <AdVoiceAction
        open={activeTool === 'adVoice'}
        renderTrigger={false}
        onOpenChange={closeActiveTool}
      />
      <VideoRestyleAction
        open={activeTool === 'videoRestyle'}
        renderTrigger={false}
        onOpenChange={closeActiveTool}
      />
      <FinalCutAction
        open={activeTool === 'finalCut'}
        renderTrigger={false}
        onOpenChange={closeActiveTool}
      />
    </>
  );
});

ToolsMenu.displayName = 'ToolsMenu';

export default ToolsMenu;
