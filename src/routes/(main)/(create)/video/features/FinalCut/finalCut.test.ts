import { describe, expect, it } from 'vitest';

import { AsyncTaskStatus } from '@/types/asyncTask';
import { type GenerationBatch } from '@/types/generation';

import {
  buildFinalCutRequest,
  listSelectableClips,
  MAX_FINAL_CUT_CLIPS,
  MIN_FINAL_CUT_CLIPS,
  moveClip,
  toggleClipSelection,
  validateClipSelection,
} from './finalCut';

const batch = (id: string, status: AsyncTaskStatus, url?: string): GenerationBatch =>
  ({
    createdAt: new Date(),
    generations: [
      {
        asset: url ? { type: 'video', url } : null,
        asyncTaskId: `${id}-task`,
        createdAt: new Date(),
        id,
        task: { id: `${id}-task`, status },
      },
    ],
    id: `${id}-batch`,
    model: 'model-x',
    prompt: `prompt ${id}`,
    provider: 'fal',
  }) as GenerationBatch;

describe('listSelectableClips', () => {
  it('only includes successful batches with an asset url', () => {
    const batches = [
      batch('a', AsyncTaskStatus.Success, 'https://f/a.mp4'),
      batch('b', AsyncTaskStatus.Processing),
      batch('c', AsyncTaskStatus.Error),
      batch('d', AsyncTaskStatus.Success, 'https://f/d.mp4'),
    ];

    expect(listSelectableClips(batches)).toEqual([
      { id: 'a', label: 'prompt a', url: 'https://f/a.mp4' },
      { id: 'd', label: 'prompt d', url: 'https://f/d.mp4' },
    ]);
  });

  it('skips a successful batch whose asset url is missing', () => {
    expect(listSelectableClips([batch('a', AsyncTaskStatus.Success)])).toEqual([]);
  });
});

describe('toggleClipSelection', () => {
  it('adds an id that is not selected and removes one that is', () => {
    expect(toggleClipSelection(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleClipSelection(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('moveClip', () => {
  it('swaps with the previous/next entry', () => {
    expect(moveClip(['a', 'b', 'c'], 'b', 'up')).toEqual(['b', 'a', 'c']);
    expect(moveClip(['a', 'b', 'c'], 'b', 'down')).toEqual(['a', 'c', 'b']);
  });

  it('is a no-op at either end', () => {
    expect(moveClip(['a', 'b', 'c'], 'a', 'up')).toEqual(['a', 'b', 'c']);
    expect(moveClip(['a', 'b', 'c'], 'c', 'down')).toEqual(['a', 'b', 'c']);
  });

  it('is a no-op for an id that is not present', () => {
    expect(moveClip(['a', 'b'], 'z', 'up')).toEqual(['a', 'b']);
  });
});

describe('validateClipSelection', () => {
  it('requires at least MIN_FINAL_CUT_CLIPS clips', () => {
    expect(validateClipSelection(MIN_FINAL_CUT_CLIPS - 1).valid).toBe(false);
    expect(validateClipSelection(MIN_FINAL_CUT_CLIPS).valid).toBe(true);
  });

  it('allows at most MAX_FINAL_CUT_CLIPS clips', () => {
    expect(validateClipSelection(MAX_FINAL_CUT_CLIPS).valid).toBe(true);
    expect(validateClipSelection(MAX_FINAL_CUT_CLIPS + 1).valid).toBe(false);
  });
});

describe('buildFinalCutRequest', () => {
  it('builds a request with an optional audio url', () => {
    expect(buildFinalCutRequest(['a', 'b'], 'https://f/audio.mp3')).toEqual({
      audioUrl: 'https://f/audio.mp3',
      clipUrls: ['a', 'b'],
    });
  });

  it('omits audioUrl when not provided', () => {
    expect(buildFinalCutRequest(['a', 'b'])).toEqual({
      audioUrl: undefined,
      clipUrls: ['a', 'b'],
    });
  });

  it('throws when the clip count is out of range', () => {
    expect(() => buildFinalCutRequest(['a'])).toThrow(/at least/);
    expect(() => buildFinalCutRequest(Array.from({ length: 13 }, (_, i) => `c${i}`))).toThrow(
      /at most/,
    );
  });
});
