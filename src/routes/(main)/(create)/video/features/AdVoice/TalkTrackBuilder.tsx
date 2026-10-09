'use client';

import { Flexbox, TextArea } from '@lobehub/ui';
import { Button, Segmented } from '@lobehub/ui/base-ui';
import { createStaticStyles, cx } from 'antd-style';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  compileTalkTrack,
  countWords,
  CTV_SPOT_LENGTHS,
  fitToSpot,
  type SpotFit,
  type SpotLength,
  TALK_TRACK_STRUCTURES,
  type TalkTrackLines,
  wordBudget,
} from './talkTrack';

const styles = createStaticStyles(({ css, cssVar }) => ({
  hint: css`
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  label: css`
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  over: css`
    color: ${cssVar.colorError};
  `,
  panel: css`
    padding: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;
    background: ${cssVar.colorFillQuaternary};
  `,
  short: css`
    color: ${cssVar.colorWarning};
  `,
}));

export const SpotFitLine = ({ fit, spot }: { fit: SpotFit; spot: SpotLength }) => {
  const { t } = useTranslation('video');
  if (fit.status === 'empty') return null;

  const seconds = fit.seconds.toFixed(1);
  return (
    <span
      data-testid={'talk-track-fit'}
      className={cx(
        styles.hint,
        fit.status === 'over' && styles.over,
        fit.status === 'short' && styles.short,
      )}
    >
      {fit.status === 'over'
        ? t('adVoice.talkTrack.fit.over', {
            overBy: fit.overBy.toFixed(1),
            seconds,
            spot: String(spot),
            words: String(fit.wordsToCut),
          })
        : t(`adVoice.talkTrack.fit.${fit.status}`, { seconds, spot: String(spot) })}
    </span>
  );
};

interface TalkTrackBuilderProps {
  onSpotChange: (spot: SpotLength) => void;
  onUse: (script: string) => void;
  speed: number;
  spot: SpotLength;
}

/**
 * Beat-by-beat script writer for CTV spots: each beat gets a word budget from
 * its share of the spot, and "Use as script" compiles the beats (with short
 * pauses at scene changes) into the voiceover script field.
 */
const TalkTrackBuilder = ({ spot, onSpotChange, speed, onUse }: TalkTrackBuilderProps) => {
  const { t } = useTranslation('video');
  const [lines, setLines] = useState<TalkTrackLines>({});

  const compiled = compileTalkTrack(lines, spot);
  const fit = fitToSpot(compiled, spot, speed);

  return (
    <Flexbox className={styles.panel} data-testid={'talk-track-builder'} gap={12}>
      <Flexbox gap={4}>
        <span className={styles.label}>{t('adVoice.talkTrack.spot')}</span>
        <Segmented
          options={CTV_SPOT_LENGTHS.map((value) => ({ label: `${value}s`, value: String(value) }))}
          value={String(spot)}
          onChange={(value) => onSpotChange(Number(value) as SpotLength)}
        />
      </Flexbox>

      {TALK_TRACK_STRUCTURES[spot].map((beat) => {
        const text = lines[beat.id] ?? '';
        const budget = wordBudget(beat.seconds, speed);
        const used = countWords(text);
        return (
          <Flexbox gap={4} key={beat.id}>
            <Flexbox horizontal justify={'space-between'}>
              <span className={styles.label}>
                {t(`adVoice.talkTrack.beat.${beat.id}`)} · {beat.seconds}s
              </span>
              <span className={cx(styles.hint, used > budget && styles.over)}>
                {t('adVoice.talkTrack.words', { budget: String(budget), used: String(used) })}
              </span>
            </Flexbox>
            <TextArea
              autoSize={{ maxRows: 4, minRows: 1 }}
              data-testid={`talk-track-beat-${beat.id}`}
              placeholder={t(`adVoice.talkTrack.placeholder.${beat.id}`)}
              value={text}
              onChange={(e) => setLines((prev) => ({ ...prev, [beat.id]: e.target.value }))}
            />
          </Flexbox>
        );
      })}

      <Flexbox horizontal align={'center'} gap={8} justify={'space-between'}>
        <SpotFitLine fit={fit} spot={spot} />
        <Button
          data-testid={'talk-track-use'}
          disabled={fit.status === 'empty'}
          size={'small'}
          type={'primary'}
          onClick={() => onUse(compiled)}
        >
          {t('adVoice.talkTrack.use')}
        </Button>
      </Flexbox>
    </Flexbox>
  );
};

export default TalkTrackBuilder;
