/**
 * CTV talk track — pure helpers for writing a voiceover script that fits a
 * standard spot length (IAB Tech Lab CTV durations, see
 * src/features/AdSpecValidator/specs.ts) and is broken into the usual
 * broadcast beats: hook → problem → product → proof → call to action.
 *
 * Timing uses a word rate rather than the character rate `estimateSpeechSeconds`
 * uses: broadcast VO copy is written and timed in words (~2.5 words/s, the
 * 150 wpm a 30s spot's 65–75 words implies), and pause tags count for their
 * stated length instead of their characters.
 */
import { buildPauseTag } from './voice';

export type SpotLength = 6 | 15 | 30 | 60;

export const CTV_SPOT_LENGTHS: SpotLength[] = [6, 15, 30, 60];

export const DEFAULT_SPOT_LENGTH: SpotLength = 30;

/** Conversational broadcast read at 1× speed. */
export const WORDS_PER_SECOND = 2.5;

/** VO should end this far before the spot does, so the last word isn't clipped by the cut. */
export const SPOT_TAIL_SECONDS = 0.5;

/** Breath between beats when the builder compiles them into one script. */
export const BEAT_PAUSE_SECONDS = 0.5;

/** Below this share of the spot the read leaves noticeable dead air. */
const SHORT_RATIO = 0.6;

export type BeatId = 'hook' | 'problem' | 'product' | 'proof' | 'cta';

export interface TalkTrackBeat {
  id: BeatId;
  seconds: number;
}

/** Beat plans per spot length; each plan's seconds sum to the spot length. */
export const TALK_TRACK_STRUCTURES: Record<SpotLength, TalkTrackBeat[]> = {
  6: [
    { id: 'hook', seconds: 3 },
    { id: 'cta', seconds: 3 },
  ],
  15: [
    { id: 'hook', seconds: 3 },
    { id: 'product', seconds: 8 },
    { id: 'cta', seconds: 4 },
  ],
  30: [
    { id: 'hook', seconds: 5 },
    { id: 'problem', seconds: 7 },
    { id: 'product', seconds: 12 },
    { id: 'cta', seconds: 6 },
  ],
  60: [
    { id: 'hook', seconds: 6 },
    { id: 'problem', seconds: 12 },
    { id: 'product', seconds: 22 },
    { id: 'proof', seconds: 12 },
    { id: 'cta', seconds: 8 },
  ],
};

const PAUSE_TAG_PATTERN = /<break\s+time="([\d.]+)s"\s*\/>/g;

export const countWords = (text: string): number => {
  const trimmed = text.replaceAll(PAUSE_TAG_PATTERN, ' ').trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
};

const sumPauseSeconds = (text: string): number => {
  let total = 0;
  for (const match of text.matchAll(PAUSE_TAG_PATTERN)) total += Number(match[1]) || 0;
  return total;
};

/** Spoken words at the read rate, plus every pause tag's stated length. One decimal. */
export const estimateTalkTrackSeconds = (script: string, speed = 1): number => {
  const words = countWords(script);
  const spoken = words / (WORDS_PER_SECOND * Math.max(speed, 0.1));
  return Math.round((spoken + sumPauseSeconds(script)) * 10) / 10;
};

/** How many words fit in `seconds` at `speed`. */
export const wordBudget = (seconds: number, speed = 1): number =>
  Math.max(1, Math.floor(seconds * WORDS_PER_SECOND * speed));

export type SpotFitStatus = 'empty' | 'fits' | 'over' | 'short';

export interface SpotFit {
  /** Usable VO time: the spot minus SPOT_TAIL_SECONDS. */
  available: number;
  /** Seconds over `available` (0 unless status is 'over'). */
  overBy: number;
  seconds: number;
  status: SpotFitStatus;
  /** Roughly how many words to cut to fit (0 unless status is 'over'). */
  wordsToCut: number;
}

export const fitToSpot = (script: string, spot: SpotLength, speed = 1): SpotFit => {
  const seconds = estimateTalkTrackSeconds(script, speed);
  const available = spot - SPOT_TAIL_SECONDS;

  if (countWords(script) === 0) {
    return { available, overBy: 0, seconds, status: 'empty', wordsToCut: 0 };
  }
  if (seconds > available) {
    const overBy = Math.round((seconds - available) * 10) / 10;
    return {
      available,
      overBy,
      seconds,
      status: 'over',
      wordsToCut: Math.ceil(overBy * WORDS_PER_SECOND * speed),
    };
  }
  return {
    available,
    overBy: 0,
    seconds,
    status: seconds < spot * SHORT_RATIO ? 'short' : 'fits',
    wordsToCut: 0,
  };
};

export type TalkTrackLines = Partial<Record<BeatId, string>>;

/**
 * Joins the spot's beats in order, skipping empty ones, with a short pause tag
 * between beats so the read breathes at each scene change.
 */
export const compileTalkTrack = (lines: TalkTrackLines, spot: SpotLength): string =>
  TALK_TRACK_STRUCTURES[spot]
    .map((beat) => lines[beat.id]?.trim())
    .filter((line): line is string => !!line)
    .join(` ${buildPauseTag(BEAT_PAUSE_SECONDS)} `);
