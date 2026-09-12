'use client';

import { Flexbox, Markdown } from '@lobehub/ui';
import { Button, Tag, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { summarizeDirectorPrompt } from '../CameraDirector/compiler';

const styles = createStaticStyles(({ css, cssVar }) => ({
  clamp: css`
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  `,
  full: css`
    padding-block: 8px;
    padding-inline: 12px;
    border-radius: 8px;
    background: ${cssVar.colorFillQuaternary};
  `,
  shots: css`
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  toggle: css`
    align-self: flex-start;
    padding-inline: 0;
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
}));

/** Prompts longer than this get clamped even when they are free-form. */
const CLAMP_THRESHOLD = 220;

interface VideoPromptSummaryProps {
  prompt: string;
}

/**
 * The feed should read like a shot list, not a screenplay. Prompts produced by
 * the Camera Director / Auto-animate collapse to subject + shots + a couple of
 * tags; long free-form prompts clamp to two lines. Either can be expanded.
 */
const VideoPromptSummary = memo<VideoPromptSummaryProps>(({ prompt }) => {
  const { t } = useTranslation('video');
  const [expanded, setExpanded] = useState(false);
  const summary = useMemo(() => summarizeDirectorPrompt(prompt), [prompt]);

  const toggle = (
    <Button
      className={styles.toggle}
      size={'small'}
      type={'text'}
      onClick={() => setExpanded((v) => !v)}
    >
      {expanded ? t('feed.hidePrompt') : t('feed.showPrompt')}
    </Button>
  );

  if (summary) {
    const shotList = summary.shots.map((s) => `${s.range} ${s.move}`).join('  →  ');
    return (
      <Flexbox flex={1} gap={4} style={{ minWidth: 0 }}>
        <Flexbox horizontal align={'center'} gap={6} style={{ flexWrap: 'wrap' }}>
          <Text weight={500}>{summary.subject || t('feed.untitled')}</Text>
          <Tag variant={'borderless'}>{t(`feed.recipe.${summary.recipe}`)}</Tag>
          {summary.reference && (
            <Tag variant={'borderless'}>{t(`feed.reference.${summary.reference}`)}</Tag>
          )}
          {summary.duration !== null && <Tag variant={'borderless'}>{summary.duration}s</Tag>}
        </Flexbox>
        {shotList && <span className={styles.shots}>{shotList}</span>}
        {toggle}
        {expanded && (
          <div className={styles.full}>
            <Markdown variant={'chat'}>{prompt}</Markdown>
          </div>
        )}
      </Flexbox>
    );
  }

  if (prompt.length <= CLAMP_THRESHOLD) {
    return <Markdown variant={'chat'}>{prompt}</Markdown>;
  }

  return (
    <Flexbox flex={1} gap={4} style={{ minWidth: 0 }}>
      {expanded ? (
        <Markdown variant={'chat'}>{prompt}</Markdown>
      ) : (
        <span className={styles.clamp}>{prompt}</span>
      )}
      {toggle}
    </Flexbox>
  );
});

VideoPromptSummary.displayName = 'VideoPromptSummary';

export default VideoPromptSummary;
