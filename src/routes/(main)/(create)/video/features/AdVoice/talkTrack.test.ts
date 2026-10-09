import { describe, expect, it } from 'vitest';

import {
  compileTalkTrack,
  countWords,
  CTV_SPOT_LENGTHS,
  estimateTalkTrackSeconds,
  fitToSpot,
  TALK_TRACK_STRUCTURES,
  wordBudget,
} from './talkTrack';

const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ');

describe('TALK_TRACK_STRUCTURES', () => {
  it.each(CTV_SPOT_LENGTHS)('beats for a %ss spot add up to the spot length', (spot) => {
    const total = TALK_TRACK_STRUCTURES[spot].reduce((sum, beat) => sum + beat.seconds, 0);
    expect(total).toBe(spot);
  });

  it('always ends on a call to action', () => {
    for (const spot of CTV_SPOT_LENGTHS) {
      expect(TALK_TRACK_STRUCTURES[spot].at(-1)?.id).toBe('cta');
    }
  });
});

describe('countWords / estimateTalkTrackSeconds', () => {
  it('ignores pause tags when counting words but adds their duration', () => {
    const script = 'Meet the new one. <break time="1.5s" /> Out now.';
    expect(countWords(script)).toBe(6);
    // 6 words / 2.5 wps = 2.4s, plus the 1.5s pause
    expect(estimateTalkTrackSeconds(script)).toBe(3.9);
  });

  it('reads faster at higher speed', () => {
    expect(estimateTalkTrackSeconds(words(50), 1)).toBe(20);
    expect(estimateTalkTrackSeconds(words(50), 1.25)).toBe(16);
  });

  it('treats empty and whitespace-only scripts as zero', () => {
    expect(countWords('   ')).toBe(0);
    expect(estimateTalkTrackSeconds('')).toBe(0);
  });
});

describe('wordBudget', () => {
  it('matches broadcast copy norms', () => {
    expect(wordBudget(30)).toBe(75);
    expect(wordBudget(15)).toBe(37);
    expect(wordBudget(4, 1.2)).toBe(12);
  });
});

describe('fitToSpot', () => {
  it('fits a 70-word read into a 30s spot', () => {
    expect(fitToSpot(words(70), 30)).toMatchObject({ seconds: 28, status: 'fits' });
  });

  it('flags a read that runs into the tail and says how much to cut', () => {
    // 80 words = 32s against 29.5s usable
    expect(fitToSpot(words(80), 30)).toEqual({
      available: 29.5,
      overBy: 2.5,
      seconds: 32,
      status: 'over',
      wordsToCut: 7,
    });
  });

  it('warns about dead air on a much shorter read', () => {
    expect(fitToSpot(words(20), 30).status).toBe('short');
  });

  it('reports an empty script as empty, not short', () => {
    expect(fitToSpot('<break time="1s" />', 15).status).toBe('empty');
  });
});

describe('compileTalkTrack', () => {
  it('joins beats in spot order with a pause between them, skipping blanks', () => {
    expect(
      compileTalkTrack(
        { cta: 'Find it at your local store.', hook: 'Tired of cold coffee?', problem: '  ' },
        30,
      ),
    ).toBe('Tired of cold coffee? <break time="0.5s" /> Find it at your local store.');
  });

  it('drops beats the chosen spot length does not use', () => {
    expect(compileTalkTrack({ cta: 'Buy now.', hook: 'Hi.', proof: 'Rated 5 stars.' }, 15)).toBe(
      'Hi. <break time="0.5s" /> Buy now.',
    );
  });
});
